const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
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
function readFoundItems() { return readJSON(FOUND_FILE); }
function writeFoundItems(items) { writeJSON(FOUND_FILE, items); }
function readLostItems() { return readJSON(LOST_FILE); }
function writeLostItems(items) { writeJSON(LOST_FILE, items); }
function readNotifications() { return readJSON(NOTIF_FILE); }
function writeNotifications(notifs) {
    const trimmed = notifs.slice(-200);
    writeJSON(NOTIF_FILE, trimmed);
}
ensureDataFiles();

// ================= FIREBASE ADMIN INIT =================
let firebaseAdmin = null;
let adminAuth = null;
let firebaseAdminConfigured = false;
function initFirebaseAdmin() {
    try {
        const admin = require("firebase-admin");
        // Try 3 methods: JSON file path, base64 env, JSON env, or default
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
        const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        const serviceAccountB64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;

        let credential = null;
        if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
            const sa = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
            credential = admin.credential.cert(sa);
            console.log("Firebase Admin: using service account file", serviceAccountPath);
        } else if (serviceAccountJson) {
            try {
                const sa = JSON.parse(serviceAccountJson);
                credential = admin.credential.cert(sa);
                console.log("Firebase Admin: using FIREBASE_SERVICE_ACCOUNT env JSON");
            } catch (e) { console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON", e.message); }
        } else if (serviceAccountB64 || serviceAccountB64Key) {
            try {
                const b64 = serviceAccountB64 || serviceAccountB64Key;
                const decoded = Buffer.from(b64, "base64").toString("utf-8");
                const sa = JSON.parse(decoded);
                credential = admin.credential.cert(sa);
                console.log("Firebase Admin: using base64 env service account");
            } catch (e) { console.warn("Failed to parse base64 service account", e.message); }
        }

        if (credential) {
            admin.initializeApp({ credential });
        } else {
            // Try applicationDefault - will work if GOOGLE_APPLICATION_CREDENTIALS is set or on GCP
            try {
                admin.initializeApp({ credential: admin.credential.applicationDefault() });
                console.log("Firebase Admin: using applicationDefault()");
            } catch {
                admin.initializeApp({});
                console.log("Firebase Admin: initialized without credential (will fail token verify if no creds)");
            }
        }
        firebaseAdmin = admin;
        adminAuth = admin.auth();
        firebaseAdminConfigured = true;
        console.log("Firebase Admin initialized successfully");
    } catch (e) {
        console.error("Firebase Admin init failed:", e.message);
        console.log("Tip: Set FIREBASE_SERVICE_ACCOUNT env var with service account JSON, or FIREBASE_SERVICE_ACCOUNT_BASE64, or GOOGLE_APPLICATION_CREDENTIALS path.");
        firebaseAdminConfigured = false;
    }
}
initFirebaseAdmin();

// ================= AUTH MIDDLEWARE =================
async function verifyFirebaseToken(req, res, next) {
    if (!firebaseAdminConfigured || !adminAuth) {
        return res.status(500).json({ success: false, message: "Firebase Admin not configured on server. Set service account env var." });
    }
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        return res.status(401).json({ success: false, message: "Missing Authorization Bearer token. Please login." });
    }
    const idToken = match[1];
    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        req.user = {
            uid: decoded.uid,
            email: decoded.email || null,
            email_verified: decoded.email_verified || false,
            name: decoded.name || decoded.displayName || null,
            displayName: decoded.name || decoded.displayName || null,
            decoded
        };
        next();
    } catch (e) {
        console.error("Token verify failed:", e.message);
        return res.status(401).json({ success: false, message: "Invalid or expired Firebase token. Please login again.", error: e.message });
    }
}

async function optionalVerifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        req.user = null;
        return next();
    }
    if (!firebaseAdminConfigured || !adminAuth) {
        req.user = null;
        return next();
    }
    const idToken = match[1];
    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        req.user = {
            uid: decoded.uid,
            email: decoded.email || null,
            email_verified: decoded.email_verified || false,
            name: decoded.name || decoded.displayName || null,
            displayName: decoded.name || decoded.displayName || null,
            decoded
        };
    } catch {
        req.user = null;
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
        read: false
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
    // For SSE: only broadcast global notifications to anonymous clients
    // Private notifications are filtered per client if we know their uid (via optional token)
    // For simplicity, broadcast all, but clients should filter. We'll still send.
    // If notification is private (ownerUid set), we will still send but frontend will hide if not owner (server filtering on GET is enforced)
    const data = `data: ${JSON.stringify(notif)}\n\n`;
    for (const res of sseClients) {
        try { res.write(data); } catch {}
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
    return [`Item: ${f.item||""}`,`Description: ${f.description||""}`,`Location: ${f.location||""}`,`Date: ${f.date||""} ${f.dateTime||""}`,`HasPhoto: ${f.photo?"yes":"no"}`, `Status: ${f.status||"found"}`].join("\n");
}
function buildLostText(l){
    return [`Item: ${l.item||l.itemName||""}`,`Description: ${l.description||l.itemDescription||""}`,`Location: ${l.location||l.lostLocation||""}`,`Date: ${l.date||l.lostDate||""} ${l.dateTime||l.lostDateTime||""}`,`Time: ${l.hour||l.lostHour||""}:${l.minute||l.lostMinute||""} ${l.amPm||l.lostAmPm||""}`,`HasPhoto: ${l.photo?"yes":"no"}`, `Status: ${l.status||"lost"}`].join("\n");
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
        const {id,item,location,date,dateTime,description,photo}=req.body;
        if(!item||typeof item!=="string"||item.trim().length===0) return res.status(400).json({success:false,message:"Item name is required."});
        if(!location||typeof location!=="string"||location.trim().length===0) return res.status(400).json({success:false,message:"Location is required."});
        if(!date||typeof date!=="string"||date.trim().length===0) return res.status(400).json({success:false,message:"Date is required."});
        if(!description||typeof description!=="string"||description.trim().length===0) return res.status(400).json({success:false,message:"Description is required."});
        if(item.trim().length>100) return res.status(400).json({success:false,message:"Item name too long (max 100)."});
        if(location.trim().length>150) return res.status(400).json({success:false,message:"Location too long (max 150)."});
        if(description.trim().length>1000) return res.status(400).json({success:false,message:"Description too long (max 1000)."});
        if(photo&&typeof photo==="string"&&photo.length>7*1024*1024) return res.status(400).json({success:false,message:"Photo too large. Max ~2MB image."});
        const newItem={ id:id?Number(id):Date.now(), item:item.trim(), location:location.trim(), date:date.trim(), dateTime:(dateTime||"").trim(), description:description.trim(), photo:photo||"", createdAt:new Date().toISOString(), status:"found" };
        const items=readFoundItems(); items.push(newItem); writeFoundItems(items);
        createNotification({
            type:"found_report",
            title:"📦 A lost item has been found!",
            message:"A new found-item report has been submitted. Keep an eye out — it might match a lost item. Open CampusFind to check matches.",
            relatedReportId:newItem.id,
            relatedFoundId:newItem.id,
            ownerUid: null
        });
        console.log("Saved found item:",newItem.id,newItem.item);
        let relevantMatches = [];
        if(aiConfigured){
            try{
                const lostCandidates = readLostItems().filter(l=>l.status==="lost").slice(-60);
                if(lostCandidates.length>0){
                    const matchResult = await performGeminiMatchingForFound(newItem, lostCandidates);
                    // Filter >=70% as per requirement
                    const strongMatches = matchResult.filter(m=>m.confidence>=70);
                    for(const m of strongMatches){
                        const lostOwner = lostCandidates.find(l=>l.id===m.lostItemId);
                        const ownerUid = lostOwner?.ownerUid || null;
                        const lostItem = lostOwner || null;
                        // create private notification
                        createNotification({
                            type:"match_found",
                            title:"🎯 Possible match found!",
                            message:`Good news — a found item may match your lost report (ID ${m.lostItemId}). Confidence ${m.confidence}%.`,
                            relatedReportId:newItem.id,
                            relatedLostId:m.lostItemId,
                            relatedFoundId:newItem.id,
                            ownerUid: ownerUid || null
                        });
                        if(lostItem){
                            relevantMatches.push({
                                lostItemId: m.lostItemId,
                                confidence: m.confidence,
                                similarity: m.similarity,
                                lostItem: lostItem
                            });
                        }
                    }
                }
            }catch(e){ console.error("Matching after found report failed:", e.message); }
        }
        res.json({success:true,message:"Report saved successfully! Global notification created.",data:newItem, relevantMatches: relevantMatches, matchesCount: relevantMatches.length});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not save the report."}); }
});

// LOST ENDPOINTS - PRIVATE + UID OWNERSHIP + VERIFIED EMAIL REQUIRED
app.post("/api/lost", verifyFirebaseToken, requireVerifiedEmail, async (req,res)=>{
    try{
        const {id,item,location,date,dateTime,description,photo,hour,minute,amPm}=req.body;
        if(!item||typeof item!=="string"||item.trim().length===0) return res.status(400).json({success:false,message:"Item name is required."});
        if(!location||typeof location!=="string"||location.trim().length===0) return res.status(400).json({success:false,message:"Location is required."});
        if(!date||typeof date!=="string"||date.trim().length===0) return res.status(400).json({success:false,message:"Date is required."});
        if(!description||typeof description!=="string"||description.trim().length===0) return res.status(400).json({success:false,message:"Description is required."});
        if(item.trim().length>100) return res.status(400).json({success:false,message:"Item name too long."});
        if(location.trim().length>150) return res.status(400).json({success:false,message:"Location too long."});
        if(description.trim().length>1000) return res.status(400).json({success:false,message:"Description too long."});
        if(photo&&typeof photo==="string"&&photo.length>7*1024*1024) return res.status(400).json({success:false,message:"Photo too large."});
        // IMPORTANT: ownerUid from verified token, NOT client
        const ownerUid = req.user.uid;
        const ownerNickname = req.user.displayName || req.user.name || "User";
        const newLost={
            id:id?Number(id):Date.now(),
            ownerUid: ownerUid,
            ownerNickname: ownerNickname.slice(0,30),
            item:item.trim(),
            location:location.trim(),
            date:date.trim(),
            dateTime:(dateTime||"").trim(),
            description:description.trim(),
            photo:photo||"",
            hour:(hour||"").toString().trim(),
            minute:(minute||"").toString().trim(),
            amPm:(amPm||"").toString().trim(),
            createdAt:new Date().toISOString(),
            status:"lost"
        };
        const lostItems=readLostItems(); lostItems.push(newLost); writeLostItems(lostItems);
        createNotification({
            type:"lost_report",
            title:"🔍 Someone has reported an item lost.",
            message:"Someone has reported an item lost. Keep an eye out around campus. If you find something, please report it.",
            relatedReportId:newLost.id,
            relatedLostId:newLost.id,
            ownerUid: null
        });
        console.log(`Saved PRIVATE lost item: ${newLost.id} owner:${ownerUid} item:${newLost.item}`);
        res.json({success:true,message:"Lost report saved privately. Global notification created.",data:{id:newLost.id, status:newLost.status, createdAt:newLost.createdAt, ownerUid:newLost.ownerUid}});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not save lost report."}); }
});

// Keep existing /api/lost GET but minimal + add auth to see private
app.get("/api/lost", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const items=readLostItems();
        if(req.user){
            // If authenticated, show only user's items full, plus minimal for others
            const myItems = items.filter(i=>i.ownerUid===req.user.uid);
            const minimal = items.map(i=>{
                if(i.ownerUid===req.user.uid){
                    return i; // full for owner
                }
                return {id:i.id, status:i.status, createdAt:i.createdAt, location: i.location? i.location.slice(0,30)+"..." : "", itemType: i.item? i.item.split(" ")[0] : "", hasOwner: !!i.ownerUid };
            });
            res.json({success:true,count:items.length,myCount:myItems.length,data:minimal, myData:myItems, note:"Authenticated: full data for own reports, minimal for others. Private lost reports - full data used server-side for Gemini matching only."});
        } else {
            const minimal = items.map(i=>({id:i.id, status:i.status, createdAt:i.createdAt, location: i.location? i.location.slice(0,30)+"..." : "", itemType: i.item? i.item.split(" ")[0] : "", hasOwner: !!i.ownerUid}));
            res.json({success:true,count:items.length,data:minimal, note:"Private lost reports - full data used server-side for Gemini matching only. Login to see your reports."});
        }
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

// NOTIFICATIONS API - AUTH-AWARE
app.get("/api/notifications", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const allNotifs = readNotifications().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        let filtered;
        if(req.user){
            // Authenticated: global (ownerUid null) + private owned by this uid
            filtered = allNotifs.filter(n=> !n.ownerUid || n.ownerUid===req.user.uid );
        } else {
            // Anonymous: only global
            filtered = allNotifs.filter(n=> !n.ownerUid );
        }
        const unread = filtered.filter(n=>!n.read && (!n.ownerUid || (req.user && n.ownerUid===req.user.uid))).length;
        // For security: never expose ownerUid to anon? Actually global has null. For private, owner knows it's theirs but we still include ownerUid for client filtering.
        // For anon we already filtered.
        // Also sanitize: ensure no email leaks (we never store email)
        res.json({success:true,count:filtered.length, unreadCount: allNotifs.filter(n=>!n.read).length, filteredUnread: unread, data:filtered, isAuthenticated: !!req.user, uid: req.user?.uid||null});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load notifications."}); }
});

// Private notifications endpoint - requires auth
app.get("/api/notifications/private", verifyFirebaseToken, requireVerifiedEmail, (req,res)=>{
    try{
        const all = readNotifications().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const mine = all.filter(n=> n.ownerUid===req.user.uid);
        res.json({success:true,count:mine.length, unreadCount:mine.filter(n=>!n.read).length, data:mine});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Could not load."}); }
});

app.post("/api/notifications/:id/read", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const id = Number(req.params.id);
        const notifs = readNotifications();
        const idx = notifs.findIndex(n=>n.id===id);
        if(idx===-1) return res.status(404).json({success:false,message:"Notification not found"});
        const notif = notifs[idx];
        // Security: if private notification, only owner can mark read
        if(notif.ownerUid){
            if(!req.user || req.user.uid!==notif.ownerUid){
                return res.status(403).json({success:false,message:"Not authorized to modify this private notification"});
            }
        }
        notifs[idx].read = true;
        writeNotifications(notifs);
        res.json({success:true,message:"Marked as read", data:notifs[idx]});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Failed"}); }
});

app.post("/api/notifications/read-all", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        let notifs = readNotifications();
        if(req.user){
            notifs = notifs.map(n=>{
                if(!n.ownerUid || n.ownerUid===req.user.uid){
                    return {...n, read:true};
                }
                return n;
            });
        } else {
            notifs = notifs.map(n=>{
                if(!n.ownerUid) return {...n, read:true};
                return n;
            });
        }
        writeNotifications(notifs);
        res.json({success:true,message:"All marked as read", count:notifs.length});
    }catch(e){ console.error(e); res.status(500).json({success:false,message:"Failed"}); }
});

app.get("/api/notifications/stream", optionalVerifyFirebaseToken, (req,res)=>{
    res.writeHead(200,{
        "Content-Type":"text/event-stream",
        "Cache-Control":"no-cache",
        "Connection":"keep-alive",
        "Access-Control-Allow-Origin":"*"
    });
    res.write(`data: {"type":"connected","message":"SSE connected for global notifications"}\n\n`);
    sseClients.add(res);
    req.on("close",()=>{ sseClients.delete(res); });
});

// GEMINI MATCHING LOGIC - PRESERVED
async function performGeminiMatching(lostReport, candidates){
    let lostEmbedding;
    try{ lostEmbedding = await getGeminiEmbedding(buildLostText(lostReport)); }
    catch(e){ console.error("Gemini embedding failed for lost:", e.message); throw e; }

    const embeddings=[]; const textsToEmbed=[]; const indicesNeedingEmbed=[];
    for(let i=0;i<candidates.length;i++){
        const f=candidates[i]; const text=buildFoundText(f); const h=hashText(text);
        const cached=embeddingCache.get(f.id);
        if(cached&&cached.hash===h) embeddings[i]=cached.embedding;
        else{ indicesNeedingEmbed.push(i); textsToEmbed.push(text); }
    }
    if(textsToEmbed.length>0){
        const batchEmbeds = await getGeminiEmbeddingsBatch(textsToEmbed);
        for(let j=0;j<batchEmbeds.length;j++){
            const origIdx=indicesNeedingEmbed[j]; const foundItem=candidates[origIdx];
            embeddings[origIdx]=batchEmbeds[j];
            embeddingCache.set(foundItem.id,{embedding:batchEmbeds[j],hash:hashText(buildFoundText(foundItem))});
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

async function performGeminiMatchingForFound(foundReport, lostCandidates){
    if(lostCandidates.length===0) return [];
    let foundEmbedding;
    try{ foundEmbedding = await getGeminiEmbedding(buildFoundText(foundReport)); }
    catch(e){ throw e; }
    const embeddings=[]; const textsToEmbed=[]; const indicesNeedingEmbed=[];
    for(let i=0;i<lostCandidates.length;i++){
        const l=lostCandidates[i]; const text=buildLostText(l); const h=hashText(text);
        const cached=embeddingCache.get(l.id);
        if(cached&&cached.hash===h) embeddings[i]=cached.embedding;
        else{ indicesNeedingEmbed.push(i); textsToEmbed.push(text); }
    }
    if(textsToEmbed.length>0){
        const batchEmbeds = await getGeminiEmbeddingsBatch(textsToEmbed);
        for(let j=0;j<batchEmbeds.length;j++){
            const origIdx=indicesNeedingEmbed[j]; const lostItem=lostCandidates[origIdx];
            embeddings[origIdx]=batchEmbeds[j];
            embeddingCache.set(lostItem.id,{embedding:batchEmbeds[j],hash:hashText(buildLostText(lostItem))});
        }
    }
    const scored=lostCandidates.map((lost,idx)=>{ const sim=embeddings[idx]?cosineSimilarity(foundEmbedding,embeddings[idx]):0; return {lost,similarity:sim}; }).sort((a,b)=>b.similarity-a.similarity);
    let topForLLM=scored.filter(s=>s.similarity>0.5).slice(0,6);
    if(topForLLM.length===0) topForLLM=scored.slice(0,2);
    const strong = topForLLM.filter(s=>s.similarity>0.65).map(s=>({
        lostItemId:s.lost.id,
        confidence:Math.round(s.similarity*90),
        similarity:s.similarity
    }));
    return strong;
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
        if(photo&&typeof photo==="string"&&photo.length>7*1024*1024) return res.status(400).json({success:false,message:"Photo too large. Max ~2MB."});
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
            const formatted=fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason, matchedFactors:r.matchedFactors, source:"fallback" }));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",message:"Gemini not configured - using deterministic fallback"});
        }
        try{
            const matches = await performGeminiMatching(lostReport, candidates);
            res.json({ success:true, matches, aiUsed:true, source:"ai", model:`${EMBEDDING_MODEL} + ${CHAT_MODEL}`, candidatesEvaluated:candidates.length, embeddingTop:Math.min(8,candidates.length) });
        }catch(e){
            console.error("Gemini matching failed, fallback:", e.message);
            const fallbackResults=fallbackMatch(lostReport,candidates);
            const formatted=fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason+` (Gemini error: ${e.message.slice(0,100)})`, matchedFactors:r.matchedFactors, source:"fallback" }));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",error:e.message});
        }
    }catch(error){
        console.error("Error in /api/match:",error);
        try{
            const allFound=readFoundItems(); const lost=req.body;
            const fallbackResults=fallbackMatch(lost,allFound.slice(0,30));
            const formatted=fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason, matchedFactors:r.matchedFactors, source:"fallback" }));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",error:"AI error, fallback used"});
        }catch{ res.status(500).json({success:false,message:"Matching failed."}); }
    }
});

app.get("/",(req,res)=>{ res.sendFile(path.join(__dirname,"index.html")); });
app.listen(PORT,()=>{ console.log(`CampusFind AI (Gemini + Firebase Auth) server running at http://localhost:${PORT}`); console.log(`Data: found=${readFoundItems().length} lost=${readLostItems().length} notifs=${readNotifications().length}`); console.log(`AI: ${aiConfigured?`Active Gemini (${EMBEDDING_MODEL} + ${CHAT_MODEL})`:"Fallback (no GEMINI_API_KEY)"}`); console.log(`Firebase Admin: ${firebaseAdminConfigured?"Configured":"NOT configured - set env vars"}`); });
