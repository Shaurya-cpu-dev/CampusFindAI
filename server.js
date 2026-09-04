const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
// Lost reports are private records and must never be exposed as static files.
app.use("/data", (req, res) => res.status(404).json({ success: false, message: "Not found" }));
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(__dirname));
app.use("/public", express.static(path.join(__dirname, "public")));

// DATA FILES
const DATA_DIR = path.join(__dirname, "data");
const FOUND_FILE = path.join(DATA_DIR, "foundItems.json");
const LOST_FILE = path.join(DATA_DIR, "lostItems.json");
const NOTIF_FILE = path.join(DATA_DIR, "notifications.json");

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FOUND_FILE)) fs.writeFileSync(FOUND_FILE, JSON.stringify([], null, 2));
    if (!fs.existsSync(LOST_FILE)) fs.writeFileSync(LOST_FILE, JSON.stringify([], null, 2));
    if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, JSON.stringify([], null, 2));
}
function readJSON(file) {
    try { ensureDataFiles(); const raw = fs.readFileSync(file, "utf-8"); const data = JSON.parse(raw); return Array.isArray(data)? data : []; }
    catch (e) { console.error(`Error reading ${file}`, e); return []; }
}
function writeJSON(file, data) {
    ensureDataFiles();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function readFoundItems() {
    ensureDataFiles();
    try {
        const data = JSON.parse(fs.readFileSync(FOUND_FILE, "utf-8"));
        if (!Array.isArray(data)) throw new Error("Found-item storage is not an array");
        return data;
    } catch (error) {
        console.error("Found-item storage read failed:", error.message);
        throw new Error("Found-item storage is unavailable");
    }
}
function writeFoundItems(items) {
    if (!Array.isArray(items)) throw new Error("Found items must be an array");
    ensureDataFiles();
    const temporaryFile = path.join(DATA_DIR, `.foundItems.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    try {
        fs.writeFileSync(temporaryFile, JSON.stringify(items, null, 2), { encoding: "utf-8", mode: 0o600, flag: "wx" });
        fs.renameSync(temporaryFile, FOUND_FILE);
    } finally {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    }
}
function nextFoundReportId(items) {
    let id = Date.now();
    const existingIds = new Set(items.map(item => Number(item.id)));
    while (existingIds.has(id)) id += 1;
    return id;
}
function readLostItems() {
    ensureDataFiles();
    try {
        const data = JSON.parse(fs.readFileSync(LOST_FILE, "utf-8"));
        if (!Array.isArray(data)) throw new Error("Lost-report storage is not an array");
        return data;
    } catch (error) {
        // Do not silently replace corrupt private data with an empty array.
        console.error("Lost-report storage read failed:", error.message);
        throw new Error("Lost-report storage is unavailable");
    }
}
function writeLostItems(items) {
    if (!Array.isArray(items)) throw new Error("Lost reports must be an array");
    ensureDataFiles();
    const temporaryFile = path.join(DATA_DIR, `.lostItems.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    try {
        // Write a complete replacement first, then atomically move it into place.
        fs.writeFileSync(temporaryFile, JSON.stringify(items, null, 2), { encoding: "utf-8", mode: 0o600, flag: "wx" });
        fs.renameSync(temporaryFile, LOST_FILE);
    } finally {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    }
}
function nextLostReportId(items) {
    let id = Date.now();
    const existingIds = new Set(items.map(item => Number(item.id)));
    while (existingIds.has(id)) id += 1;
    return id;
}
function normalizeReportPhoto(photo) {
    if (photo === undefined || photo === null || photo === "") return "";
    if (typeof photo !== "string") throw new Error("Photo must be an image data URL.");
    const match = photo.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) throw new Error("Photo must be a PNG, JPEG, or WebP data URL.");
    const imageBytes = Buffer.byteLength(match[2], "base64");
    if (imageBytes > 10 * 1024 * 1024) throw new Error("Photo too large. Max 10MB image.");
    return `data:image/${match[1].toLowerCase()};base64,${match[2]}`;
}
function optionalLostText(value, maxLength, fieldName) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string") throw new Error(`${fieldName} must be text.`);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new Error(`${fieldName} is too long.`);
    return normalized;
}
function readNotifications() { return readJSON(NOTIF_FILE); }
function writeNotifications(notifs) {
    if (!Array.isArray(notifs)) throw new Error("Notifications must be an array");
    ensureDataFiles();
    const trimmed = notifs.slice(-200);
    const temporaryFile = path.join(DATA_DIR, `.notifications.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    try {
        fs.writeFileSync(temporaryFile, JSON.stringify(trimmed, null, 2), { encoding: "utf-8", mode: 0o600, flag: "wx" });
        fs.renameSync(temporaryFile, NOTIF_FILE);
    } finally {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    }
}
ensureDataFiles();

// ================= FIREBASE ADMIN INIT =================
let firebaseAdmin = null;
let adminAuth = null;
let firebaseAdminConfigured = false;
let firebaseAdminCredentialSource = null;

function buildAuthenticatedUser(decoded) {
    return {
        // These fields are derived exclusively from the Firebase Admin-verified token.
        uid: decoded.uid,
        email: decoded.email || null,
        email_verified: decoded.email_verified === true,
        name: decoded.name || null,
        displayName: decoded.name || null,
        decoded
    };
}

function initFirebaseAdmin() {
    try {
        const admin = require("firebase-admin");
        // Prefer an explicit service account for Render; application default credentials
        // are supported when GOOGLE_APPLICATION_CREDENTIALS is provided.
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
        const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        const serviceAccountB64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;

        let credential = null;
        if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
            const sa = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
            credential = admin.credential.cert(sa);
            firebaseAdminCredentialSource = "service account file";
        } else if (serviceAccountJson) {
            try {
                const sa = JSON.parse(serviceAccountJson);
                credential = admin.credential.cert(sa);
                firebaseAdminCredentialSource = "FIREBASE_SERVICE_ACCOUNT";
            } catch (e) { console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON", e.message); }
        } else if (serviceAccountB64 || serviceAccountB64Key) {
            try {
                const b64 = serviceAccountB64 || serviceAccountB64Key;
                const decoded = Buffer.from(b64, "base64").toString("utf-8");
                const sa = JSON.parse(decoded);
                credential = admin.credential.cert(sa);
                firebaseAdminCredentialSource = "base64 service account";
            } catch (e) { console.warn("Failed to parse base64 service account", e.message); }
        }

        if (credential) admin.initializeApp({ credential });
        else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            admin.initializeApp({ credential: admin.credential.applicationDefault() });
            firebaseAdminCredentialSource = "application default credentials";
        } else {
            throw new Error("No Firebase Admin credentials configured");
        }
        firebaseAdmin = admin;
        adminAuth = admin.auth();
        firebaseAdminConfigured = true;
        console.log(`Firebase Admin initialized with ${firebaseAdminCredentialSource}`);
    } catch (e) {
        console.error("Firebase Admin init failed:", e.message);
        console.log("Set FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_BASE64, or GOOGLE_APPLICATION_CREDENTIALS before starting the server.");
        firebaseAdminConfigured = false;
        firebaseAdminCredentialSource = null;
    }
}
initFirebaseAdmin();

// ================= AUTH MIDDLEWARE =================
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        return res.status(401).json({ success: false, message: "Missing Authorization Bearer token. Please login." });
    }
    const idToken = match[1].trim();
    if (!firebaseAdminConfigured || !adminAuth) {
        // Development / test fallback when Firebase Admin service account is not configured
        req.user = {
            uid: idToken,
            email: idToken + "@campus.edu",
            email_verified: !idToken.toLowerCase().includes("unverified"),
            displayName: "Student " + idToken.slice(0, 8)
        };
        return next();
    }
    try {
        const decoded = await adminAuth.verifyIdToken(idToken, true);
        req.user = buildAuthenticatedUser(decoded);
        next();
    } catch (e) {
        console.error("Token verify failed:", e.message);
        return res.status(401).json({ success: false, message: "Invalid, expired, or revoked Firebase token. Please login again." });
    }
}

async function optionalVerifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || "";
    if (!authHeader) {
        req.user = null;
        return next();
    }
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ success: false, message: "Malformed Authorization header." });
    const idToken = match[1].trim();
    if (!firebaseAdminConfigured || !adminAuth) {
        req.user = {
            uid: idToken,
            email: idToken + "@campus.edu",
            email_verified: !idToken.toLowerCase().includes("unverified"),
            displayName: "Student " + idToken.slice(0, 8)
        };
        return next();
    }
    try {
        const decoded = await adminAuth.verifyIdToken(idToken, true);
        req.user = buildAuthenticatedUser(decoded);
    } catch (e) {
        console.error("Optional token verify failed:", e.message);
        return res.status(401).json({ success: false, message: "Invalid, expired, or revoked Firebase token. Please login again." });
    }
    next();
}

function requireVerifiedEmail(req, res, next) {
    if (!req.user) return res.status(401).json({ success: false, message: "Not authenticated" });
    if (!req.user.email_verified) {
        return res.status(403).json({ success: false, message: "Email not verified. Please verify your email. Check inbox and click verification link.", code: "EMAIL_NOT_VERIFIED" });
    }
    next();
}

// NOTIFICATION HELPERS - GLOBAL + PRIVATE
function createNotification({ type, title, message, relatedReportId = null, relatedLostId = null, relatedFoundId = null, ownerUid = null }) {
    const notifs = readNotifications();
    const n = {
        id: Date.now() + Math.floor(Math.random()*10000),
        type: (type||"general").toString().slice(0,30),
        title: (title||"").toString().trim().slice(0,120),
        message: (message||"").toString().trim().slice(0,500),
        relatedReportId: relatedReportId? Number(relatedReportId) : null,
        relatedLostId: relatedLostId? Number(relatedLostId) : null,
        relatedFoundId: relatedFoundId? Number(relatedFoundId) : null,
        ownerUid: ownerUid ? ownerUid.toString().slice(0,128) : null,
        createdAt: new Date().toISOString(),
        read: false,
        readBy: ownerUid ? undefined : []
    };
    if (!n.title ||!n.message) return null;
    // Security: never store email in notification
    notifs.push(n);
    writeNotifications(notifs);
    console.log(`[NOTIF] ${n.type} ${n.id} owner:${n.ownerUid||'global'} ${n.title}`);
    broadcastNotification(n);
    return n;
}

const sseClients = new Set();
function broadcastNotification(notif) {
    const data = `data: ${JSON.stringify(notif)}\n\n`;
    for (const client of sseClients) {
        try {
            if (!notif.ownerUid) {
                // Global notification: broadcast to all connected clients
                client.res.write(data);
            } else if (client.uid && client.uid === notif.ownerUid) {
                // Private notification: broadcast ONLY to the recipient client matching ownerUid
                client.res.write(data);
            }
        } catch (err) {
            console.error("SSE broadcast error:", err.message);
        }
    }
}

// GEMINI REAL AI SETUP - PRESERVED
let genAI = null;
let aiConfigured = false;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-1.5-flash";

function initGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log("Gemini not configured: GEMINI_API_KEY missing -> fallback mode");
        aiConfigured = false;
        return;
    }
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        genAI = new GoogleGenerativeAI(apiKey);
        aiConfigured = true;
        console.log(`Gemini configured: embedding=${EMBEDDING_MODEL} chat=${CHAT_MODEL}`);
    } catch (e) {
        console.error("Failed to init Gemini:", e.message);
        aiConfigured = false;
    }
}
initGemini();

function getEmbeddingModel() {
    if (!genAI) throw new Error("Gemini not configured");
    return genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
}
function getChatModel() {
    if (!genAI) throw new Error("Gemini not configured");
    return genAI.getGenerativeModel({ model: CHAT_MODEL });
}

const embeddingCache = new Map();
function hashText(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h; }
function cosineSimilarity(a,b){
    if(!a||!b||a.length!==b.length) return 0;
    let dot=0,na=0,nb=0;
    for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    if(na===0||nb===0) return 0;
    return dot/(Math.sqrt(na)*Math.sqrt(nb));
}
function buildFoundText(f){
    return [
        `Item: ${f.item||f.title||""}`,
        `Category: ${f.category||"Others"}`,
        `Description: ${f.description||""}`,
        `Location: ${f.location||""}`,
        `Date: ${f.date||""} ${f.dateTime||""}`,
        `HasPhoto: ${(f.imageUrl||f.photo)?"yes":"no"}`,
        `Image attached: ${f.imageUrl||f.photo||"none"}`,
        `Status: ${f.status||"found"}`
    ].join("\n");
}
function buildLostText(l){
    return [
        `Item: ${l.item||l.title||l.itemName||""}`,
        `Category: ${l.category||"Others"}`,
        `Description: ${l.description||l.itemDescription||""}`,
        `Location: ${l.location||l.lostLocation||""}`,
        `Date: ${l.date||l.lostDate||""} ${l.dateTime||l.lostDateTime||""}`,
        `Time: ${l.hour||l.lostHour||""}:${l.minute||l.lostMinute||""} ${l.amPm||l.lostAmPm||""}`,
        `HasPhoto: ${(l.imageUrl||l.photo)?"yes":"no"}`,
        `Image attached: ${l.imageUrl||l.photo||"none"}`,
        `Status: ${l.status||"lost"}`
    ].join("\n");
}
function toPublicFoundReport(found) {
    return {
        id: found.id,
        item: found.item || found.title || "",
        title: found.title || found.item || "",
        category: found.category || "Others",
        location: found.location,
        date: found.date,
        dateTime: found.dateTime || "",
        hour: found.hour || "",
        minute: found.minute || "",
        amPm: found.amPm || "",
        description: found.description,
        photo: found.photo || "",
        imageUrl: found.imageUrl || found.photo || "",
        createdAt: found.createdAt,
        status: found.status || "found"
    };
}
function toPublicSearchMatches(matches) {
    return matches.map(match => ({
        foundItemId: match.foundItemId,
        foundItem: toPublicFoundReport(match.foundItem),
        confidence: match.confidence,
        reason: match.reason,
        matchedFactors: match.matchedFactors || [],
        embeddingSimilarity: match.embeddingSimilarity,
        source: match.source
    }));
}

async function getGeminiEmbedding(text){
    if(!aiConfigured||!genAI) throw new Error("Gemini not configured");
    const model = getEmbeddingModel();
    const truncated = text.slice(0,8000);
    const result = await model.embedContent(truncated);
    if (!result.embedding ||!result.embedding.values) throw new Error("No embedding values returned");
    return result.embedding.values;
}
async function getGeminiEmbeddingsBatch(texts){
    const embeddings = [];
    for(const t of texts){
        const emb = await getGeminiEmbedding(t);
        embeddings.push(emb);
    }
    return embeddings;
}

function fallbackMatch(lost, candidates){
    function cleanText(t){ return (t||"").toLowerCase().replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim(); }
    function getWords(t){
        const stop=new Set(["the","a","an","and","or","of","in","on","at","to","for","with","is","was","are","it","this","that"]);
        return cleanText(t).split(/\s+/).filter(w=>w.length>2&&!stop.has(w));
    }
    const lostText = `${lost.item||lost.itemName||""} ${lost.description||lost.itemDescription||""} ${lost.location||lost.lostLocation||""}`;
    const lostWords = new Set(getWords(lostText));
    const lostColor = (lostText.match(/\b(black|white|red|blue|green|yellow|orange|pink|purple|brown|grey|gray|silver|gold|dark)\b/i)||[])[0]?.toLowerCase();
    return candidates.map(found=>{
        const foundText = `${found.item} ${found.description} ${found.location}`;
        const foundWords = new Set(getWords(foundText));
        let common=0; lostWords.forEach(w=>{ if(foundWords.has(w)) common++; });
        const wordScore = lostWords.size? (common/lostWords.size)*50 : 0;
        const foundColor = (foundText.match(/\b(black|white|red|blue|green|yellow|orange|pink|purple|brown|grey|gray|silver|gold|dark)\b/i)||[])[0]?.toLowerCase();
        let colorScore=0;
        if(lostColor&&foundColor) colorScore = lostColor===foundColor? 15 : -10;
        else if(lostColor||foundColor) colorScore=5;
        const locOverlap = getWords(lost.location||lost.lostLocation||"").some(w=>getWords(found.location).includes(w))? 15 : 0;
        let dateScore=0;
        try{
            const ld = lost.date||lost.lostDate? new Date(lost.date||lost.lostDate) : null;
            const fd = found.date? new Date(found.date) : null;
            if(ld&&fd&&!isNaN(ld)&&!isNaN(fd)){
                const diff = Math.abs((ld-fd)/(1000*60*60*24));
                if(diff<=1) dateScore=10; else if(diff<=3) dateScore=6; else if(diff<=7) dateScore=3; else if(diff>30) dateScore=-5;
            }
        }catch{}
        const total=Math.min(100,Math.max(0,Math.round(wordScore+colorScore+locOverlap+dateScore)));
        const factors=[];
        if(common>0) factors.push("description similarity");
        if(colorScore>0) factors.push("color");
        if(locOverlap>0) factors.push("location");
        if(dateScore>0) factors.push("date");
        if(found.item&&lost.item&&found.item.toLowerCase().includes(lost.item.toLowerCase().split(" ")[0])) factors.push("item type");
        return { foundItem: found, confidence: total, reason: `Fallback matching based on ${factors.join(", ")||"keyword overlap"}: ${common} common terms.`, matchedFactors: factors.length?factors:["description similarity"], source:"fallback" };
    }).filter(r=>r.confidence>=20).sort((a,b)=>b.confidence-a.confidence);
}

const rateMap=new Map();
function checkRateLimit(ip){
    const now=Date.now(); const windowMs=60*1000; const max=20;
    const entry=rateMap.get(ip)||{count:0,start:now};
    if(now-entry.start>windowMs){ entry.count=0; entry.start=now; }
    entry.count++; rateMap.set(ip,entry); return entry.count<=max;
}

// API STATUS - Gemini + Firebase
app.get("/api/status",(req,res)=>{
    res.json({
        success:true,
        message: aiConfigured? "CampusFind AI backend running with REAL Gemini matching" : "CampusFind AI backend running in fallback mode - Gemini key not configured",
        ai:{
            configured: aiConfigured,
            status: aiConfigured? "AI Matching Active" : "Fallback Matching",
            provider: aiConfigured? "gemini" : "none",
            embeddingModel: aiConfigured? EMBEDDING_MODEL : null,
            chatModel: aiConfigured? CHAT_MODEL : null,
            details: aiConfigured? `Using ${EMBEDDING_MODEL} for semantic embeddings + ${CHAT_MODEL} for reasoning. API key server-side only.` : "Set GEMINI_API_KEY env var to enable real Gemini AI. Get from https://aistudio.google.com/app/apikey"
        },
        auth: {
            firebaseAdminConfigured,
            projectId: "campusfind-ai-d10c1",
            authDomain: "campusfind-ai-d10c1.firebaseapp.com"
        },
        storage:{ foundItems: readFoundItems().length, lostItems: readLostItems().length, notifications: readNotifications().length },
        notifications: { count: readNotifications().length, sseClients: sseClients.size }
    });
});

// FOUND ENDPOINTS - PRESERVED + private notification logic
app.get("/api/found",(req,res)=>{
    try{ const items=readFoundItems(); res.json({success:true,count:items.length,data:items}); }
    catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load reports."}); }
});

app.post("/api/found", optionalVerifyFirebaseToken, async (req,res)=>{
    try{
        const ip=req.ip||req.headers['x-forwarded-for']||'unknown';
        if(!checkRateLimit(ip)) return res.status(429).json({success:false,message:"Too many reports. Please wait a minute."});
        const item = (req.body.item || req.body.title || req.body.itemName || "").toString().trim();
        const category = (req.body.category || "Others").toString().trim().slice(0, 50);
        const location = (req.body.location || req.body.foundLocation || "").toString().trim();
        const date = (req.body.date || req.body.foundDate || "").toString().trim();
        const description = (req.body.description || req.body.foundDescription || req.body.itemDescription || "").toString().trim();
        const photo = req.body.photo;
        const imageUrl = (req.body.imageUrl || "").toString().trim();
        const hour = (req.body.hour || req.body.foundHour || "").toString().trim();
        const minute = (req.body.minute || req.body.foundMinute || "").toString().trim();
        const amPm = (req.body.amPm || req.body.foundAmPm || "").toString().trim();
        let dateTime = (req.body.dateTime || req.body.foundDateTime || "").toString().trim();

        if (req.body.imageUrl) {
            if (!req.body.imageUrl.startsWith('https://res.cloudinary.com/v6m777sp/')) {
                return res.status(400).json({ success: false, message: "Invalid image URL. Must start with https://res.cloudinary.com/v6m777sp/" });
            }
        }

        if(!item) return res.status(400).json({success:false,message:"Item name is required."});
        if(!location) return res.status(400).json({success:false,message:"Location is required."});
        if(!date) return res.status(400).json({success:false,message:"Date is required."});
        if(!description) return res.status(400).json({success:false,message:"Description is required."});
        if(item.length>100) return res.status(400).json({success:false,message:"Item name too long (max 100)."});
        if(location.length>150) return res.status(400).json({success:false,message:"Location too long (max 150)."});
        if(date.length>32) return res.status(400).json({success:false,message:"Date is too long."});
        if(description.length>1000) return res.status(400).json({success:false,message:"Description too long (max 1000)."});

        if(!dateTime && date && hour && minute){
            let nh = parseInt(hour, 10);
            if(amPm.toUpperCase() === "AM" && nh === 12) nh = 0;
            if(amPm.toUpperCase() === "PM" && nh !== 12) nh += 12;
            const ch = String(nh).padStart(2, "0");
            dateTime = `${date}T${ch}:${minute}:00`;
        }

        let normalizedPhoto;
        let normalizedDateTime;
        let normalizedHour;
        let normalizedMinute;
        let normalizedAmPm;
        try {
            normalizedPhoto = normalizeReportPhoto(photo);
            normalizedDateTime = optionalLostText(dateTime, 40, "Date and time");
            normalizedHour = optionalLostText(hour, 2, "Hour");
            normalizedMinute = optionalLostText(minute, 2, "Minute");
            normalizedAmPm = optionalLostText(amPm, 2, "AM/PM");
        } catch (error) {
            return res.status(400).json({success:false,message:error.message});
        }
        const items=readFoundItems();
        const finalPhoto = imageUrl || normalizedPhoto || "";
        const newItem={
            id:nextFoundReportId(items),
            item:item,
            title:item,
            category:category || "Others",
            location:location,
            date:date,
            dateTime:normalizedDateTime,
            hour:normalizedHour,
            minute:normalizedMinute,
            amPm:normalizedAmPm,
            description:description,
            photo:finalPhoto,
            imageUrl:finalPhoto,
            createdAt:new Date().toISOString(),
            status:"found"
        };
        items.push(newItem); writeFoundItems(items);
        createNotification({
            type:"found_report",
            title:"📦 A lost item has been found!",
            message:"A new found-item report has been submitted. Keep an eye out — it might match a lost item. Open CampusFind to check matches.",
            relatedReportId:newItem.id,
            relatedFoundId:newItem.id,
            ownerUid: null
        });
        console.log("Saved found item:",newItem.id,newItem.item);
        const relevantMatches = [];
        let matchingSource = aiConfigured ? "ai" : "fallback";
        try{
            const lostCandidates = readLostItems().filter(l=>l.status==="lost").slice(-60);
            if(lostCandidates.length > 0){
                const matchResult = aiConfigured
                    ? await performGeminiMatchingForFound(newItem, lostCandidates)
                    : performFallbackMatchingForFound(newItem, lostCandidates);
                for(const m of matchResult.filter(match=>match.confidence>=70)){
                    const lostOwner = lostCandidates.find(l=>l.id===m.lostItemId);
                    if(!lostOwner?.ownerUid) continue;
                    createNotification({
                        type:"match_found",
                        title:"🎯 Possible match found!",
                        message:`A found item may match your lost report. Confidence ${m.confidence}%.`,
                        relatedReportId:newItem.id,
                        relatedLostId:m.lostItemId,
                        relatedFoundId:newItem.id,
                        ownerUid: lostOwner.ownerUid
                    });
                    // This summary is intentionally report-free: the submitter is not
                    // entitled to see another user's private lost-item data.
                    relevantMatches.push({
                        confidence:m.confidence,
                        reason:`High confidence match (${m.confidence}%) based on ${m.matchedFactors?.join(", ") || "item similarity"}. The owner has been notified privately.`,
                        matchedFactors:m.matchedFactors || [],
                        source:m.source || matchingSource
                    });
                }
            }
        }catch(e){
            console.error("Matching after found report failed:", e.message);
            matchingSource = "unavailable";
        }
        res.status(201).json({
            success:true,
            message:"Found report saved successfully.",
            data:newItem,
            relevantMatches,
            matchesCount:relevantMatches.length,
            matching:{source:matchingSource, model:aiConfigured?`${EMBEDDING_MODEL} + ${CHAT_MODEL}`:null}
        });
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not save the report."}); }
});

// LOST ENDPOINTS - PRIVATE + UID OWNERSHIP + VERIFIED EMAIL REQUIRED
app.post("/api/lost", verifyFirebaseToken, requireVerifiedEmail, async (req,res)=>{
    try{
        const item = (req.body.item || req.body.title || req.body.itemName || "").toString().trim();
        const category = (req.body.category || "Others").toString().trim().slice(0, 50);
        const location = (req.body.location || req.body.lostLocation || "").toString().trim();
        const date = (req.body.date || req.body.lostDate || "").toString().trim();
        const description = (req.body.description || req.body.itemDescription || "").toString().trim();
        const photo = req.body.photo;
        const imageUrl = (req.body.imageUrl || "").toString().trim();
        const hour = (req.body.hour || req.body.lostHour || "").toString().trim();
        const minute = (req.body.minute || req.body.lostMinute || "").toString().trim();
        const amPm = (req.body.amPm || req.body.lostAmPm || "").toString().trim();
        let dateTime = (req.body.dateTime || req.body.lostDateTime || "").toString().trim();

        if (req.body.imageUrl) {
            if (!req.body.imageUrl.startsWith('https://res.cloudinary.com/v6m777sp/')) {
                return res.status(400).json({ success: false, message: "Invalid image URL. Must start with https://res.cloudinary.com/v6m777sp/" });
            }
        }

        if(!item) return res.status(400).json({success:false,message:"Item name is required."});
        if(!location) return res.status(400).json({success:false,message:"Location is required."});
        if(!date) return res.status(400).json({success:false,message:"Date is required."});
        if(!description) return res.status(400).json({success:false,message:"Description is required."});
        if(item.length>100) return res.status(400).json({success:false,message:"Item name too long."});
        if(location.length>150) return res.status(400).json({success:false,message:"Location too long."});
        if(date.length>32) return res.status(400).json({success:false,message:"Date is too long."});
        if(description.length>1000) return res.status(400).json({success:false,message:"Description too long."});

        if(!dateTime && date && hour && minute){
            let nh = parseInt(hour, 10);
            if(amPm.toUpperCase() === "AM" && nh === 12) nh = 0;
            if(amPm.toUpperCase() === "PM" && nh !== 12) nh += 12;
            const ch = String(nh).padStart(2, "0");
            dateTime = `${date}T${ch}:${minute}:00`;
        }

        let normalizedPhoto;
        let normalizedDateTime;
        let normalizedHour;
        let normalizedMinute;
        let normalizedAmPm;
        try {
            normalizedPhoto = normalizeReportPhoto(photo);
            normalizedDateTime = optionalLostText(dateTime, 40, "Date and time");
            normalizedHour = optionalLostText(hour, 2, "Hour");
            normalizedMinute = optionalLostText(minute, 2, "Minute");
            normalizedAmPm = optionalLostText(amPm, 2, "AM/PM");
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
        // IMPORTANT: ownerUid from verified token, NOT client
        const ownerUid = req.user.uid;
        const ownerNickname = String(req.user.displayName || req.user.name || "User");
        const lostItems = readLostItems();
        const finalPhoto = imageUrl || normalizedPhoto || "";
        const newLost={
            // Ignore any client-supplied ID. The server owns report identity and ownership.
            id:nextLostReportId(lostItems),
            ownerUid: ownerUid,
            ownerNickname: ownerNickname.slice(0,30),
            item:item,
            title:item,
            category:category || "Others",
            location:location,
            date:date,
            dateTime:normalizedDateTime,
            description:description,
            photo:finalPhoto,
            imageUrl:finalPhoto,
            hour:normalizedHour,
            minute:normalizedMinute,
            amPm:normalizedAmPm,
            createdAt:new Date().toISOString(),
            status:"lost"
        };
        lostItems.push(newLost); writeLostItems(lostItems);
        createNotification({
            type:"lost_report",
            title:"🔍 Someone has reported an item lost.",
            message:"Someone has reported an item lost. Keep an eye out around campus. If you find something, please report it.",
            relatedReportId:newLost.id,
            relatedLostId:newLost.id,
            ownerUid: null
        });
        console.log(`Saved PRIVATE lost item: ${newLost.id} owner:${ownerUid} item:${newLost.item}`);

        const relevantMatches = [];
        let matchingSource = aiConfigured ? "ai" : "fallback";
        try {
            const foundCandidates = readFoundItems().filter(f => f.status === "found").slice(-60);
            if (foundCandidates.length > 0) {
                const matchResult = aiConfigured
                    ? await performGeminiMatching(newLost, foundCandidates)
                    : fallbackMatch(newLost, foundCandidates);
                for (const m of matchResult.filter(match => match.confidence >= 70)) {
                    createNotification({
                        type: "match_found",
                        title: "🎯 Possible match found!",
                        message: `A found item in campus records may match your lost report. Confidence ${m.confidence}%.`,
                        relatedReportId: newLost.id,
                        relatedLostId: newLost.id,
                        relatedFoundId: m.foundItemId,
                        ownerUid: ownerUid
                    });
                }
                const formatted = toPublicSearchMatches(matchResult.filter(match => match.confidence >= 70));
                relevantMatches.push(...formatted);
            }
        } catch (e) {
            console.error("Matching after lost report failed:", e.message);
            matchingSource = "unavailable";
        }

        res.status(201).json({
            success:true,
            message:"Lost report saved privately.",
            data:newLost,
            matches:relevantMatches,
            relevantMatches,
            matching:{source:matchingSource, model:aiConfigured?`${EMBEDDING_MODEL} + ${CHAT_MODEL}`:null}
        });
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not save lost report."}); }
});

// Private reports are only returned to the verified account that created them.
app.get("/api/lost", verifyFirebaseToken, requireVerifiedEmail, (req,res)=>{
    try{
        const items=readLostItems().filter(i=>i.ownerUid===req.user.uid);
        res.json({success:true,count:items.length,data:items});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load lost reports."}); }
});

// NEW: My lost reports - requires auth + verified
app.get("/api/my-lost", verifyFirebaseToken, requireVerifiedEmail, (req,res)=>{
    try{
        const items=readLostItems().filter(i=>i.ownerUid===req.user.uid);
        res.json({success:true,count:items.length,data:items});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load."}); }
});

// NEW: My account info
app.get("/api/me", verifyFirebaseToken, (req,res)=>{
    res.json({success:true, uid:req.user.uid, email:req.user.email, email_verified:req.user.email_verified, displayName:req.user.displayName});
});

// NOTIFICATIONS API - AUTH-AWARE & ISOLATED
app.get("/api/notifications", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const allNotifs = readNotifications().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const userUid = req.user ? req.user.uid : null;
        let filtered;
        if(userUid){
            // Authenticated: global (ownerUid null) + private owned by this uid
            filtered = allNotifs.filter(n=> !n.ownerUid || n.ownerUid===userUid );
        } else {
            // Anonymous: only global
            filtered = allNotifs.filter(n=> !n.ownerUid );
        }
        const personalized = filtered.map(n => {
            const isRead = n.ownerUid ? !!n.read : (Array.isArray(n.readBy) && userUid ? n.readBy.includes(userUid) : false);
            return {
                ...n,
                read: isRead
            };
        });
        const unreadCount = personalized.filter(n => !n.read).length;
        res.json({
            success: true,
            count: personalized.length,
            unreadCount: unreadCount,
            filteredUnread: unreadCount,
            data: personalized,
            isAuthenticated: !!req.user,
            uid: userUid
        });
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load notifications."}); }
});

// Private notifications endpoint - requires auth
app.get("/api/notifications/private", verifyFirebaseToken, requireVerifiedEmail, (req,res)=>{
    try{
        const all = readNotifications().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const mine = all.filter(n=> n.ownerUid===req.user.uid).map(n => ({ ...n, read: !!n.read }));
        res.json({success:true,count:mine.length, unreadCount:mine.filter(n=>!n.read).length, data:mine});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load."}); }
});

app.post("/api/notifications/:id/read", verifyFirebaseToken, (req,res)=>{
    try{
        const id = Number(req.params.id);
        const userUid = req.user.uid;
        const notifs = readNotifications();
        const idx = notifs.findIndex(n=>n.id===id);
        if(idx===-1) return res.status(404).json({success:false,message:"Notification not found"});
        const notif = notifs[idx];
        if(notif.ownerUid){
            if(notif.ownerUid !== userUid){
                return res.status(403).json({success:false,message:"Not authorized to modify this private notification"});
            }
            notifs[idx].read = true;
        } else {
            if(!Array.isArray(notifs[idx].readBy)) notifs[idx].readBy = [];
            if(!notifs[idx].readBy.includes(userUid)) notifs[idx].readBy.push(userUid);
        }
        writeNotifications(notifs);
        const updated = {
            ...notifs[idx],
            read: true
        };
        res.json({success:true,message:"Marked as read", data:updated});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Failed"}); }
});

app.post("/api/notifications/read-all", verifyFirebaseToken, (req,res)=>{
    try{
        const userUid = req.user.uid;
        let notifs = readNotifications();
        notifs = notifs.map(n=>{
            if(n.ownerUid && n.ownerUid===userUid){
                return {...n, read:true};
            } else if(!n.ownerUid){
                const readBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
                if(!readBy.includes(userUid)) readBy.push(userUid);
                return {...n, readBy};
            }
            return n;
        });
        writeNotifications(notifs);
        res.json({success:true,message:"All notifications marked as read for user"});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Failed"}); }
});

// SSE AUTHENTICATED STREAM - PER-USER ISOLATION
app.get("/api/notifications/stream", async (req,res)=>{
    let token = null;
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (match) {
        token = match[1].trim();
    } else if (req.query && req.query.token) {
        token = String(req.query.token).trim();
    } else if (req.query && req.query.auth) {
        token = String(req.query.auth).trim();
    }

    let user = null;
    if (firebaseAdminConfigured && adminAuth) {
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required for SSE stream. Provide Bearer token or ?token= query parameter."
            });
        }
        try {
            const decoded = await adminAuth.verifyIdToken(token, true);
            user = buildAuthenticatedUser(decoded);
        } catch (e) {
            console.error("SSE token verification failed:", e.message);
            return res.status(401).json({
                success: false,
                message: "Invalid, expired, or revoked Firebase token for SSE stream."
            });
        }
    } else {
        // Development / fallback mode when Firebase Admin is not initialized
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required for SSE stream. Provide Bearer token or ?token= query parameter."
            });
        }
        user = { uid: token, displayName: "Authenticated User" };
    }

    res.writeHead(200,{
        "Content-Type":"text/event-stream",
        "Cache-Control":"no-cache",
        "Connection":"keep-alive",
        "Access-Control-Allow-Origin":"*"
    });

    const client = { res, uid: user ? user.uid : null, user };
    sseClients.add(client);
    res.write(`data: ${JSON.stringify({type:"connected",message:"SSE connected with user isolation",uid:client.uid})}\n\n`);
    req.on("close",()=>{ sseClients.delete(client); });
});

// GEMINI MATCHING LOGIC - PRESERVED
async function performGeminiMatching(lostReport, candidates){
    let lostEmbedding;
    try{ lostEmbedding = await getGeminiEmbedding(buildLostText(lostReport)); }
    catch(e){ console.error("Gemini embedding failed for lost:", e.message); throw e; }

    const embeddings=[]; const textsToEmbed=[]; const indicesNeedingEmbed=[];
    for(let i=0;i<candidates.length;i++){
        const f=candidates[i]; const text=buildFoundText(f); const h=hashText(text);
        const cached=embeddingCache.get(`found:${f.id}`);
        if(cached&&cached.hash===h) embeddings[i]=cached.embedding;
        else{ indicesNeedingEmbed.push(i); textsToEmbed.push(text); }
    }
    if(textsToEmbed.length>0){
        const batchEmbeds = await getGeminiEmbeddingsBatch(textsToEmbed);
        for(let j=0;j<batchEmbeds.length;j++){
            const origIdx=indicesNeedingEmbed[j]; const foundItem=candidates[origIdx];
            embeddings[origIdx]=batchEmbeds[j];
            embeddingCache.set(`found:${foundItem.id}`,{embedding:batchEmbeds[j],hash:hashText(buildFoundText(foundItem))});
        }
    }
    const scored=candidates.map((found,idx)=>{ const sim=embeddings[idx]?cosineSimilarity(lostEmbedding,embeddings[idx]):0; return {found,similarity:sim}; }).sort((a,b)=>b.similarity-a.similarity);
    let topForLLM=scored.filter(s=>s.similarity>0.45).slice(0,8);
    if(topForLLM.length===0) topForLLM=scored.slice(0,3);

    const promptCandidates=topForLLM.map(s=>({ id:s.found.id, item:s.found.item, description:s.found.description, location:s.found.location, date:s.found.date, hasPhoto:!!s.found.photo, embeddingSimilarity:Math.round(s.similarity*100)/100 }));

    const systemInstruction=`You are CampusFind AI Gemini matching expert. Evaluate semantic similarity, not exact word match.
Consider item type/category, color, brand/model, distinctive marks, location proximity, date compatibility, description similarity, photo availability.
Example Lost: "Black Samsung phone. There is a small crack near the bottom-right corner of the screen. I think I lost it near the college library yesterday afternoon."
Found: "Dark black Samsung smartphone discovered beside a library desk. Screen has a noticeable crack around the lower-right area."
=> STRONG match: type, color, brand, distinctive mark, location align despite different wording.
Return ONLY valid JSON array, no markdown. Each element: foundItemId (must be from candidate list, do NOT invent IDs), confidence 0-100 (derived from evidence), reason 1-2 sentences, matchedFactors array from ["item type","color","brand/model","distinctive mark","location","date","time","description similarity","photo"]
Confidence 90-100 highly consistent, 70-89 strong similarity, 40-69 moderate, 0-39 weak.
If no good match return empty array. Do NOT hallucinate IDs.`;

    const userPrompt=`Lost Report:
${JSON.stringify({item:lostReport.item,description:lostReport.description,location:lostReport.location,date:lostReport.date,hasPhoto:!!lostReport.photo},null,2)}

Candidate Found Reports (embedding similarity pre-filtered):
${JSON.stringify(promptCandidates,null,2)}

Return JSON array with evaluation. Example:
[{"foundItemId":123,"confidence":94,"reason":"The item type, color, distinctive damage, and location are highly consistent.","matchedFactors":["item type","color","distinctive mark","location"]}]
`;

    let llmResults=[];
    try{
        const chatModel = getChatModel();
        const result = await chatModel.generateContent(`${systemInstruction}\n\n${userPrompt}`);
        const response = await result.response;
        let text = response.text().trim();
        const m = text.match(/\[[\s\S]*\]/);
        if(m) text = m[0];
        llmResults = JSON.parse(text);
        if(!Array.isArray(llmResults)) llmResults=[];
    }catch(e){
        console.error("Gemini LLM reasoning failed:", e.message);
        llmResults = topForLLM.map(s=>({ foundItemId:s.found.id, confidence:Math.round(Math.min(95,Math.max(10,s.similarity*100+5))), reason:`Semantic embedding similarity ${Math.round(s.similarity*100)}% between reports via Gemini ${EMBEDDING_MODEL}.`, matchedFactors:["description similarity","item type"] }));
    }

    const candidateIds = new Set(candidates.map(c=>c.id));
    const finalMatches = llmResults.map(r=>{
        const fid = Number(r.foundItemId);
        if(!candidateIds.has(fid)) return null;
        const found = candidates.find(f=>f.id===fid);
        if(!found) return null;
        let finalConfidence = Number(r.confidence)||0;
        if(found.location&&lostReport.location&&found.location.toLowerCase().trim()===lostReport.location.toLowerCase().trim()) finalConfidence=Math.min(100,finalConfidence+3);
        try{
            const ld=new Date(lostReport.date); const fd=new Date(found.date);
            if(!isNaN(ld)&&!isNaN(fd)){
                const diff=Math.abs((ld-fd)/(1000*60*60*24));
                if(diff<=2) finalConfidence=Math.min(100,finalConfidence+3);
            }
        }catch{}
        const allowed=["item type","color","brand/model","distinctive mark","location","date","time","description similarity","photo"];
        const factors=Array.isArray(r.matchedFactors)?r.matchedFactors.filter(f=>allowed.includes(f)).slice(0,5):[];
        return {
            foundItemId:found.id,
            foundItem:found,
            confidence:Math.round(Math.min(100,Math.max(0,finalConfidence))),
            reason:(r.reason||"").toString().slice(0,300),
            matchedFactors:factors.length?factors:["description similarity"],
            embeddingSimilarity:Math.round((topForLLM.find(t=>t.found.id===found.id)?.similarity||0)*100),
            source:"ai"
        };
    }).filter(Boolean).sort((a,b)=>b.confidence-a.confidence);

    let resultMatches = finalMatches;
    if(resultMatches.length===0 && scored[0] && scored[0].similarity>0.6){
        resultMatches = scored.slice(0,3).filter(s=>s.similarity>0.55).map(s=>({
            foundItemId:s.found.id,
            foundItem:s.found,
            confidence:Math.round(s.similarity*85),
            reason:`High semantic similarity (${Math.round(s.similarity*100)}%) detected by Gemini embeddings.`,
            matchedFactors:["description similarity","item type"],
            embeddingSimilarity:Math.round(s.similarity*100),
            source:"ai"
        }));
    }
    return resultMatches;
}

function applyMatchContext(confidence, found, lost) {
    let result = Number(confidence) || 0;
    if (found.location && lost.location && found.location.trim().toLowerCase() === lost.location.trim().toLowerCase()) result += 3;
    const foundDate = new Date(found.date);
    const lostDate = new Date(lost.date);
    if (!Number.isNaN(foundDate.valueOf()) && !Number.isNaN(lostDate.valueOf())) {
        const daysApart = Math.abs(foundDate - lostDate) / (1000 * 60 * 60 * 24);
        if (daysApart <= 2) result += 3;
    }
    return Math.round(Math.min(100, Math.max(0, result)));
}

function performFallbackMatchingForFound(foundReport, lostCandidates) {
    return lostCandidates.map(lost => {
        const match = fallbackMatch(lost, [foundReport])[0];
        if (!match) return null;
        return {
            lostItemId: lost.id,
            confidence: applyMatchContext(match.confidence, foundReport, lost),
            reason: match.reason,
            matchedFactors: match.matchedFactors,
            source: "fallback"
        };
    }).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
}

async function performGeminiMatchingForFound(foundReport, lostCandidates){
    if(lostCandidates.length===0) return [];
    const foundEmbedding = await getGeminiEmbedding(buildFoundText(foundReport));
    const embeddings=[]; const textsToEmbed=[]; const indicesNeedingEmbed=[];
    for(let i=0;i<lostCandidates.length;i++){
        const lost=lostCandidates[i]; const text=buildLostText(lost); const h=hashText(text);
        const cached=embeddingCache.get(`lost:${lost.id}`);
        if(cached&&cached.hash===h) embeddings[i]=cached.embedding;
        else{ indicesNeedingEmbed.push(i); textsToEmbed.push(text); }
    }
    if(textsToEmbed.length>0){
        const batchEmbeds = await getGeminiEmbeddingsBatch(textsToEmbed);
        for(let j=0;j<batchEmbeds.length;j++){
            const originalIndex=indicesNeedingEmbed[j]; const lost=lostCandidates[originalIndex];
            embeddings[originalIndex]=batchEmbeds[j];
            embeddingCache.set(`lost:${lost.id}`,{embedding:batchEmbeds[j],hash:hashText(buildLostText(lost))});
        }
    }
    const scored=lostCandidates.map((lost,index)=>({lost,similarity:embeddings[index]?cosineSimilarity(foundEmbedding,embeddings[index]):0})).sort((a,b)=>b.similarity-a.similarity);
    let candidates=scored.filter(score=>score.similarity>=0.45).slice(0,8);
    if(candidates.length===0) candidates=scored.slice(0,3);
    if(candidates.length===0) return [];

    const prompt=`You are validating whether one found report matches private lost reports. Compare item type, color, brand/model, distinctive marks, location, and date. Return ONLY a JSON array. Each entry must have lostItemId from the candidates, confidence 0-100, reason (one concise sentence), and matchedFactors chosen only from ["item type","color","brand/model","distinctive mark","location","date","time","description similarity","photo"]. Return an empty array for no meaningful match.\n\nFound report:\n${JSON.stringify({item:foundReport.item,description:foundReport.description,location:foundReport.location,date:foundReport.date,hasPhoto:!!foundReport.photo})}\n\nPrivate candidate reports:\n${JSON.stringify(candidates.map(candidate=>({lostItemId:candidate.lost.id,item:candidate.lost.item,description:candidate.lost.description,location:candidate.lost.location,date:candidate.lost.date,hasPhoto:!!candidate.lost.photo,embeddingSimilarity:Math.round(candidate.similarity*100)/100})))}`;

    let evaluations=[];
    try {
        const response = await (await getChatModel().generateContent(prompt)).response;
        const responseText = response.text().trim();
        const json = responseText.match(/\[[\s\S]*\]/)?.[0] || "[]";
        evaluations = JSON.parse(json);
        if (!Array.isArray(evaluations)) evaluations=[];
    } catch (error) {
        console.error("Gemini found-to-lost reasoning failed:", error.message);
        // The fallback is still a real Gemini semantic similarity score, not a mock value.
        evaluations=candidates.filter(candidate=>candidate.similarity>=0.55).map(candidate=>({
            lostItemId:candidate.lost.id,
            confidence:Math.round(candidate.similarity*100),
            reason:`Gemini semantic embedding similarity is ${Math.round(candidate.similarity*100)}%.`,
            matchedFactors:["description similarity","item type"]
        }));
    }
    const byId=new Map(candidates.map(candidate=>[Number(candidate.lost.id),candidate]));
    const allowedFactors=new Set(["item type","color","brand/model","distinctive mark","location","date","time","description similarity","photo"]);
    return evaluations.map(evaluation=>{
        const candidate=byId.get(Number(evaluation.lostItemId));
        if(!candidate) return null;
        const factors=Array.isArray(evaluation.matchedFactors)?evaluation.matchedFactors.filter(factor=>allowedFactors.has(factor)).slice(0,5):[];
        return {
            lostItemId:candidate.lost.id,
            confidence:applyMatchContext(evaluation.confidence,foundReport,candidate.lost),
            reason:String(evaluation.reason||"Gemini identified semantic similarity between the reports.").slice(0,300),
            matchedFactors:factors.length?factors:["description similarity"],
            embeddingSimilarity:Math.round(candidate.similarity*100),
            source:"ai"
        };
    }).filter(Boolean).sort((a,b)=>b.confidence-a.confidence);
}

// MAIN MATCH ENDPOINT - LOST SEARCH -> FOUND - now supports optional auth for better UX
app.post("/api/match", optionalVerifyFirebaseToken, async (req,res)=>{
    try{
        const ip=req.ip||req.headers['x-forwarded-for']||'unknown';
        if(!checkRateLimit(ip)) return res.status(429).json({success:false,message:"Too many requests. Please wait a minute."});
        const {item,itemName,location,lostLocation,date,lostDate,dateTime,lostDateTime,hour,lostHour,minute,lostMinute,amPm,lostAmPm,description,itemDescription,photo}=req.body;
        const lostItemName=(item||itemName||"").toString().trim();
        const lostLoc=(location||lostLocation||"").toString().trim();
        const lostDesc=(description||itemDescription||"").toString().trim();
        const lostDateStr=(date||lostDate||"").toString().trim();
        if(!lostItemName) return res.status(400).json({success:false,message:"Item name is required."});
        if(!lostLoc) return res.status(400).json({success:false,message:"Location is required."});
        if(lostItemName.length>100) return res.status(400).json({success:false,message:"Item name too long."});
        if(lostLoc.length>150) return res.status(400).json({success:false,message:"Location too long."});
        if(lostDesc.length>1000) return res.status(400).json({success:false,message:"Description too long."});
        if(photo&&typeof photo==="string"&&photo.length>20*1024*1024) return res.status(400).json({success:false,message:"Photo too large. Max ~10MB."});
        const lostReport={ item:lostItemName, itemName:lostItemName, location:lostLoc, lostLocation:lostLoc, description:lostDesc, itemDescription:lostDesc, date:lostDateStr, lostDate:lostDateStr, dateTime:dateTime||lostDateTime||"", hour:hour||lostHour||"", minute:minute||lostMinute||"", amPm:amPm||lostAmPm||"", photo:photo||"", status:"lost", id:Date.now() };
        const allFound=readFoundItems();
        if(allFound.length===0) return res.json({success:true,matches:[],message:"No found items in database yet",aiUsed:aiConfigured,source:aiConfigured?"ai":"fallback"});
        let candidates=[...allFound].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,60);
        if(lostDateStr){
            try{
                const lostD=new Date(lostDateStr);
                if(!isNaN(lostD)){
                    const filtered=candidates.filter(f=>{
                        if(!f.date) return true;
                        const fd=new Date(f.date); if(isNaN(fd)) return true;
                        const diff=Math.abs((lostD-fd)/(1000*60*60*24)); return diff<=45;
                    });
                    if(filtered.length>0) candidates=filtered;
                }
            }catch{}
        }
        candidates=candidates.slice(0,30);
        if(!aiConfigured||!genAI){
            const fallbackResults=fallbackMatch(lostReport,candidates);
            const formatted=toPublicSearchMatches(fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason, matchedFactors:r.matchedFactors, source:"fallback" })));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",message:"Gemini not configured - using deterministic fallback"});
        }
        try{
            const matches = await performGeminiMatching(lostReport, candidates);
            res.json({ success:true, matches:toPublicSearchMatches(matches), aiUsed:true, source:"ai", model:`${EMBEDDING_MODEL} + ${CHAT_MODEL}`, candidatesEvaluated:candidates.length, embeddingTop:Math.min(8,candidates.length) });
        }catch(e){
            console.error("Gemini matching failed, fallback:", e.message);
            const fallbackResults=fallbackMatch(lostReport,candidates);
            const formatted=toPublicSearchMatches(fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason, matchedFactors:r.matchedFactors, source:"fallback" })));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",error:e.message});
        }
    }catch(error){
        console.error("Error in /api/match:",error);
        try{
            const allFound=readFoundItems(); const lost=req.body;
            const fallbackResults=fallbackMatch(lost,allFound.slice(0,30));
            const formatted=toPublicSearchMatches(fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason, matchedFactors:r.matchedFactors, source:"fallback" })));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",error:"AI error, fallback used"});
        }catch{ res.status(500).json({success:false,message:"Matching failed."}); }
    }
});

app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/data")) {
        return next();
    }
    const distIndex = path.join(__dirname, "dist", "index.html");
    if (fs.existsSync(distIndex)) {
        return res.sendFile(distIndex);
    }
    return res.sendFile(path.join(__dirname, "index.html"));
});
app.listen(PORT,()=>{ console.log(`CampusFind AI (Gemini + Firebase Auth) server running at http://localhost:${PORT}`); console.log(`Data: found=${readFoundItems().length} lost=${readLostItems().length} notifs=${readNotifications().length}`); console.log(`AI: ${aiConfigured?`Active Gemini (${EMBEDDING_MODEL} + ${CHAT_MODEL})`:"Fallback (no GEMINI_API_KEY)"}`); console.log(`Firebase Admin: ${firebaseAdminConfigured?"Configured":"NOT configured - set env vars"}`); });
