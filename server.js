const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

// Security headers
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("X-XSS-Protection","1; mode=block");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "25mb" }));
app.use("/public", express.static(path.join(__dirname, "public")));
// Serve CSS at root for compatibility with existing HTML that uses public/css/style.css and style.css
app.use(express.static(path.join(__dirname, "public")));
// Only serve specific HTML files, not entire root
app.get("/style.css", (req,res)=> res.sendFile(path.join(__dirname, "public", "css", "style.css")));

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
            try {
                admin.initializeApp({ credential: admin.credential.applicationDefault() });
                console.log("Firebase Admin: using applicationDefault()");
            } catch {
                admin.initializeApp({});
                console.log("Firebase Admin: initialized without credential");
            }
        }
        firebaseAdmin = admin;
        adminAuth = admin.auth();
        firebaseAdminConfigured = true;
        console.log("Firebase Admin initialized successfully");
    } catch (e) {
        console.error("Firebase Admin init failed:", e.message);
        firebaseAdminConfigured = false;
    }
}
initFirebaseAdmin();

// ================= AUTH MIDDLEWARE =================
async function verifyFirebaseToken(req, res, next) {
    if (!firebaseAdminConfigured ||!adminAuth) {
        return res.status(500).json({ success: false, message: "Firebase Admin not configured on server." });
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
        return res.status(401).json({ success: false, message: "Invalid or expired Firebase token.", error: e.message });
    }
}

async function optionalVerifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) { req.user = null; return next(); }
    if (!firebaseAdminConfigured ||!adminAuth) { req.user = null; return next(); }
    const idToken = match[1];
    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        req.user = { uid: decoded.uid, email: decoded.email, email_verified: decoded.email_verified, displayName: decoded.name || decoded.displayName };
        next();
    } catch { req.user = null; next(); }
}

// Rate limit simple
const rateMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const rec = rateMap.get(ip) || { count: 0, start: now };
    if (now - rec.start > 60000) { rec.count = 0; rec.start = now; }
    rec.count++;
    rateMap.set(ip, rec);
    return rec.count <= 30;
}

// ================ GEMINI SETUP (PRESERVED) ================
let genAI = null; let aiConfigured = false;
const EMBEDDING_MODEL = "text-embedding-004"; const CHAT_MODEL = "gemini-1.5-flash";
let embeddingCache = new Map();
function hashText(t){ let h=0; for(let i=0;i<t.length;i++){ h=((h<<5)-h)+t.charCodeAt(i); h|=0; } return String(h); }
function buildLostText(l){ return `${l.item||l.itemName||""} ${l.location||l.lostLocation||""} ${l.description||l.itemDescription||""} ${l.date||l.lostDate||""}`.trim(); }
function buildFoundText(f){ return `${f.item||""} ${f.location||""} ${f.description||""} ${f.date||""}`.trim(); }
function cosineSimilarity(a,b){ if(!a||!b||a.length!==b.length) return 0; let dot=0,na=0,nb=0; for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; } return dot/(Math.sqrt(na)*Math.sqrt(nb)||1); }

async function getGeminiEmbedding(text){
    if(!genAI) throw new Error("GenAI not configured");
    const model=genAI.getGenerativeModel({model:EMBEDDING_MODEL});
    const res=await model.embedContent(text);
    return res.embedding.values;
}
async function getGeminiEmbeddingsBatch(texts){
    const out=[]; for(const t of texts){ out.push(await getGeminiEmbedding(t)); } return out;
}

function fallbackMatch(lostReport, candidates){
    const lostText=buildLostText(lostReport).toLowerCase();
    const scored=candidates.map(found=>{
        const foundText=buildFoundText(found).toLowerCase();
        let score=0; const factors=[];
        const lostWords=lostText.split(/\s+/).filter(w=>w.length>2);
        const foundWords=foundText.split(/\s+/).filter(w=>w.length>2);
        const common=lostWords.filter(w=>foundWords.includes(w));
        if(common.length>0){ score+= (common.length/Math.max(lostWords.length,1))*60; factors.push(`Shares keywords: ${common.slice(0,3).join(", ")}`); }
        if(lostReport.location && found.location && lostReport.location.toLowerCase().includes(found.location.toLowerCase().slice(0,4))){ score+=20; factors.push("Similar location"); }
        if(lostReport.description && found.description){
            const ld=lostReport.description.toLowerCase(); const fd=found.description.toLowerCase();
            if(ld.length>10 && fd.length>10){ const overlap=ld.split(" ").filter(w=>fd.includes(w)).length; if(overlap>2){ score+=15; factors.push("Similar distinctive description"); } }
        }
        return {foundItem:found, confidence: Math.min(95, Math.round(score)), reason: factors.join(" • ")||"Low similarity", matchedFactors:factors.length?factors:["Similar description"]};
    }).filter(r=>r.confidence>=50).sort((a,b)=>b.confidence-a.confidence);
    return scored;
}

async function performGeminiMatching(lostReport, candidates){
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    if(!process.env.GEMINI_API_KEY){ throw new Error("GEMINI_API_KEY not set"); }
    if(!genAI){ genAI=new GoogleGenerativeAI(process.env.GEMINI_API_KEY); }
    let lostEmbedding; try{ lostEmbedding=await getGeminiEmbedding(buildLostText(lostReport)); }catch(e){ throw e; }
    const embeddings=[]; const textsToEmbed=[]; const indicesNeedingEmbed=[];
    for(let i=0;i<candidates.length;i++){ const f=candidates[i]; const text=buildFoundText(f); const h=hashText(text); const cached=embeddingCache.get(f.id); if(cached&&cached.hash===h) embeddings[i]=cached.embedding; else{ indicesNeedingEmbed.push(i); textsToEmbed.push(text); } }
    if(textsToEmbed.length>0){
        const batchEmbeds=await getGeminiEmbeddingsBatch(textsToEmbed);
        for(let j=0;j<batchEmbeds.length;j++){ const origIdx=indicesNeedingEmbed[j]; const foundItem=candidates[origIdx]; embeddings[origIdx]=batchEmbeds[j]; embeddingCache.set(foundItem.id,{embedding:batchEmbeds[j],hash:hashText(buildFoundText(foundItem))}); }
    }
    const scored=candidates.map((found,idx)=>{ const sim=embeddings[idx]?cosineSimilarity(lostEmbedding,embeddings[idx]):0; return {found,similarity:sim}; }).sort((a,b)=>b.similarity-a.similarity);
    let topForLLM=scored.filter(s=>s.similarity>0.5).slice(0,6); if(topForLLM.length===0) topForLLM=scored.slice(0,2);

    const chatModel=genAI.getGenerativeModel({model:CHAT_MODEL});
    const prompt=`You are CampusFind AI matcher. Lost: ${JSON.stringify(lostReport)}. Found candidates: ${JSON.stringify(topForLLM.map(s=>({id:s.found.id,item:s.found.item,location:s.found.location,description:s.found.description,date:s.found.date,similarity:s.similarity})))}. For each, give confidence 0-100 and 2-4 short factors why it matches (same item type, similar color/mark, location, time). Return JSON array: [{"foundItemId": id, "confidence": number, "matchedFactors": ["factor1","factor2"]}] Only JSON.`;
    let llmResults=[];
    try{
        const result=await chatModel.generateContent(prompt);
        const text=result.response.text();
        const jsonMatch=text.match(/\[[\s\S]*\]/);
        if(jsonMatch) llmResults=JSON.parse(jsonMatch[0]);
    }catch(e){ console.error("LLM parse failed", e.message); llmResults=topForLLM.map(s=>({foundItemId:s.found.id,confidence:Math.round(s.similarity*90),matchedFactors:[`Similarity ${(s.similarity*100).toFixed(0)}%`]})); }

    const formatted=llmResults.map(r=>{
        const found=candidates.find(f=>String(f.id)===String(r.foundItemId));
        if(!found) return null;
        return {foundItemId:found.id, foundItem:found, confidence: Math.min(95, Math.max(0, r.confidence||0)), matchedFactors: r.matchedFactors||["Similar item"], reason: (r.matchedFactors||[]).join(" • "), source:"ai"};
    }).filter(Boolean).filter(r=>r.confidence>=50).sort((a,b)=>b.confidence-a.confidence);
    return formatted;
}

// INIT GEMINI
try{
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    if(process.env.GEMINI_API_KEY){ genAI=new GoogleGenerativeAI(process.env.GEMINI_API_KEY); aiConfigured=true; console.log("Gemini configured"); }
    else console.log("Gemini not configured - fallback will be used");
}catch(e){ console.log("Gemini init failed, fallback"); }

// ================= NOTIFICATIONS SSE =================
let sseClients=[];
app.get("/api/notifications/stream",(req,res)=>{
    res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache"); res.setHeader("Connection","keep-alive");
    res.write(`data: ${JSON.stringify({type:"connected"})}\n\n`);
    sseClients.push(res);
    req.on("close",()=>{ sseClients=sseClients.filter(c=>c!==res); });
});
function broadcastNotification(notif){
    sseClients.forEach(c=>{ try{ c.write(`data: ${JSON.stringify(notif)}\n\n`); }catch{} });
}

// ================= API ROUTES (PRESERVED + FIXED) =================
app.get("/api/status",(req,res)=>{
    res.json({success:true, ai:{configured:aiConfigured,status:aiConfigured?"Active Gemini":"Fallback - no key",embeddingModel:EMBEDDING_MODEL,chatModel:CHAT_MODEL,details:aiConfigured?"Real Gemini":"Set GEMINI_API_KEY"}, auth:{firebaseAdminConfigured}, storage:{foundItems:readFoundItems().length,lostItems:readLostItems().length,notifications:readNotifications().length}});
});

// NEW: Get single found item by ID (for match page)
app.get("/api/found/:id", (req,res)=>{
  try{
    const id=String(req.params.id);
    const items=readFoundItems();
    const item=items.find(i=>String(i.id)===id);
    if(!item) return res.status(404).json({success:false,message:"Found item not found"});
    res.json({success:true,data:item});
  }catch(e){ res.status(500).json({success:false,message:"Error"}); }
});

// NEW: Get single lost item by ID - owner only
app.get("/api/lost/:id", verifyFirebaseToken, (req,res)=>{
  try{
    const id=String(req.params.id);
    const items=readLostItems();
    const item=items.find(i=>String(i.id)===id);
    if(!item) return res.status(404).json({success:false,message:"Lost item not found"});
    if(item.ownerUid && item.ownerUid!==req.user.uid){
      return res.status(403).json({success:false,message:"Not authorized - private report"});
    }
    res.json({success:true,data:item});
  }catch(e){ res.status(500).json({success:false,message:"Error"}); }
});

// NEW: Get recent found items
app.get("/api/found-items", (req,res)=>{
  try{
    const fullItems=readFoundItems().slice(-20).reverse();
    res.json({success:true,count:fullItems.length,data:fullItems});
  }catch(e){ res.status(500).json({success:false,message:"Error"}); }
});

// Serve match page
app.get("/match.html", (req,res)=> res.sendFile(path.join(__dirname,"match.html")));
app.get("/match", (req,res)=> res.sendFile(path.join(__dirname,"match.html")));

app.get("/api/notifications", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const all=readNotifications();
        const user=req.user;
        let filtered=all;
        if(user){
            filtered=all.filter(n=>!n.ownerUid || n.ownerUid===user.uid);
        }else{
            filtered=all.filter(n=>!n.ownerUid);
        }
        res.json({success:true,count:filtered.length,data:filtered.slice().reverse()});
    }catch(e){ res.status(500).json({success:false,message:"Failed to load"}); }
});

app.post("/api/notifications/:id/read", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const id=String(req.params.id);
        const notifs=readNotifications();
        const idx=notifs.findIndex(n=>String(n.id)===id);
        if(idx===-1) return res.status(404).json({success:false,message:"Not found"});
        const n=notifs[idx];
        if(n.ownerUid && req.user && n.ownerUid!==req.user.uid) return res.status(403).json({success:false,message:"Not authorized"});
        if(n.ownerUid &&!req.user) return res.status(401).json({success:false,message:"Login required"});
        notifs[idx].read=true;
        writeNotifications(notifs);
        res.json({success:true});
    }catch(e){ res.status(500).json({success:false,message:"Error"}); }
});

app.post("/api/notifications/read-all", optionalVerifyFirebaseToken, (req,res)=>{
    try{
        const notifs=readNotifications();
        const user=req.user;
        notifs.forEach(n=>{
            if(!n.ownerUid) n.read=true;
            else if(user && n.ownerUid===user.uid) n.read=true;
        });
        writeNotifications(notifs);
        res.json({success:true});
    }catch(e){ res.status(500).json({success:false,message:"Error"}); }
});

app.get("/api/my-lost", verifyFirebaseToken, (req,res)=>{
    try{
        const all=readLostItems();
        const mine=all.filter(i=>i.ownerUid===req.user.uid).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        res.json({success:true,count:mine.length,data:mine});
    }catch(e){ res.status(500).json({success:false,message:"Error"}); }
});

app.post("/api/lost", verifyFirebaseToken, async (req,res)=>{
    try{
        const ip=req.ip||req.headers['x-forwarded-for']||'unknown';
        if(!checkRateLimit(ip)) return res.status(429).json({success:false,message:"Too many requests."});
        if(!req.user.email_verified &&!req.user.emailVerified &&!req.user.decoded?.email_verified) {
            const u=req.user.decoded||req.user;
            if(!u.email_verified &&!u.emailVerified) return res.status(403).json({success:false,message:"Email not verified. Please verify your email."});
        }
        const {item,itemName,location,lostLocation,date,lostDate,dateTime,lostDateTime,hour,lostHour,minute,lostMinute,amPm,lostAmPm,description,itemDescription,photo}=req.body;
        const itemNameFinal=(item||itemName||"").toString().trim();
        const locFinal=(location||lostLocation||"").toString().trim();
        const descFinal=(description||itemDescription||"").toString().trim();
        const dateFinal=(date||lostDate||"").toString().trim();
        if(!itemNameFinal) return res.status(400).json({success:false,message:"Item name required"});
        if(!locFinal) return res.status(400).json({success:false,message:"Location required"});
        if(itemNameFinal.length>100) return res.status(400).json({success:false,message:"Item name too long"});
        if(locFinal.length>150) return res.status(400).json({success:false,message:"Location too long"});
        if(descFinal.length>1000) return res.status(400).json({success:false,message:"Description too long"});
        if(photo&&typeof photo==="string"&&photo.length>20*1024*1024) return res.status(400).json({success:false,message:"Photo too large. Max ~10MB."});

        const newLost={
            id: Date.now(),
            item: itemNameFinal,
            location: locFinal,
            date: dateFinal,
            dateTime: dateTime||lostDateTime||"",
            description: descFinal,
            photo: photo||"",
            hour: hour||lostHour||"",
            minute: minute||lostMinute||"",
            amPm: amPm||lostAmPm||"",
            ownerUid: req.user.uid,
            ownerEmail: req.user.email,
            createdAt: new Date().toISOString(),
            status: "lost"
        };
        const lostItems=readLostItems(); lostItems.push(newLost); writeLostItems(lostItems);

        const notifs=readNotifications();
        notifs.push({id:Date.now()+1, type:"lost_report", title:"Someone lost an item on campus", message:`A fellow student lost ${itemNameFinal} near ${locFinal}. Keep an eye out.`, ownerUid:null, relatedLostId:newLost.id, createdAt:new Date().toISOString(), read:false});
        writeNotifications(notifs);
        broadcastNotification(notifs[notifs.length-1]);

        // Async match against found
        (async()=>{
            try{
                const allFound=readFoundItems();
                if(allFound.length===0) return;
                let candidates=[...allFound].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,30);
                let matches=[];
                if(aiConfigured && genAI){
                    try{ matches=await performGeminiMatching(newLost, candidates); }catch(e){ console.error("Gemini match error for lost", e.message); matches=fallbackMatch(newLost, candidates).map(r=>({foundItemId:r.foundItem.id,foundItem:r.foundItem,confidence:r.confidence,matchedFactors:r.matchedFactors,reason:r.reason,source:"fallback"})); }
                }else{
                    matches=fallbackMatch(newLost, candidates).map(r=>({foundItemId:r.foundItem.id,foundItem:r.foundItem,confidence:r.confidence,matchedFactors:r.matchedFactors,reason:r.reason,source:"fallback"}));
                }
                const relevant=matches.filter(m=>m.confidence>=70);
                if(relevant.length>0){
                    const notifs2=readNotifications();
                    relevant.forEach(m=>{
                        notifs2.push({
                            id: Date.now()+Math.random(),
                            type:"match_found",
                            title:"Possible match for your report",
                            message:`Good news — a found item may match your lost report: ${newLost.item} → ${m.foundItem.item}. Confidence ${m.confidence}%. Tap to review.`,
                            ownerUid: newLost.ownerUid,
                            relatedLostId: newLost.id,
                            relatedFoundId: m.foundItemId,
                            confidence: m.confidence,
                            matchedFactors: m.matchedFactors,
                            createdAt: new Date().toISOString(),
                            read:false
                        });
                    });
                    writeNotifications(notifs2);
                    relevant.forEach(r=> broadcastNotification(r));
                }
            }catch(e){ console.error("Async lost match error", e); }
        })();

        // Return immediate with matches for wow moment
        let immediateMatches=[];
        try{
            const allFound=readFoundItems();
            let candidates=[...allFound].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,30);
            if(aiConfigured && genAI){
                try{ immediateMatches=await performGeminiMatching(newLost, candidates); }catch{ immediateMatches=fallbackMatch(newLost, candidates).map(r=>({foundItemId:r.foundItem.id,foundItem:r.foundItem,confidence:r.confidence,matchedFactors:r.matchedFactors})); }
            }else{
                immediateMatches=fallbackMatch(newLost, candidates).map(r=>({foundItemId:r.foundItem.id,foundItem:r.foundItem,confidence:r.confidence,matchedFactors:r.matchedFactors}));
            }
        }catch{}
        const relevantMatches=immediateMatches.filter(m=>m.confidence>=70);
        res.json({success:true,data:newLost,relevantMatches, matches:immediateMatches});
    }catch(e){ console.error("Error /api/lost", e); res.status(500).json({success:false,message:"Failed to save lost report"}); }
});

app.post("/api/found", optionalVerifyFirebaseToken, async (req,res)=>{
    try{
        const ip=req.ip||req.headers['x-forwarded-for']||'unknown';
        if(!checkRateLimit(ip)) return res.status(429).json({success:false,message:"Too many requests."});
        const {id,item,location,date,dateTime,description,photo}=req.body;
        const itemName=(item||"").toString().trim();
        const loc=(location||"").toString().trim();
        const desc=(description||"").toString().trim();
        const dateStr=(date||"").toString().trim();
        if(!itemName) return res.status(400).json({success:false,message:"Item name required"});
        if(!loc) return res.status(400).json({success:false,message:"Location required"});
        if(itemName.length>100) return res.status(400).json({success:false,message:"Item too long"});
        if(loc.length>150) return res.status(400).json({success:false,message:"Location too long"});
        if(desc.length>1000) return res.status(400).json({success:false,message:"Description too long"});
        if(photo&&typeof photo==="string"&&photo.length>20*1024*1024) return res.status(400).json({success:false,message:"Photo too large"});

        const newFound={
            id: id||Date.now(),
            item: itemName,
            location: loc,
            date: dateStr,
            dateTime: dateTime||"",
            description: desc,
            photo: photo||"",
            createdAt: new Date().toISOString(),
            status:"found",
            reportedBy: req.user? req.user.uid : null
        };
        const foundItems=readFoundItems(); foundItems.push(newFound); writeFoundItems(foundItems);

        const notifs=readNotifications();
        notifs.push({id:Date.now()+1,type:"found_report",title:"A lost item has been found on campus",message:"Someone reported a found item on campus. If you lost something similar, check your private matches.",ownerUid:null,relatedFoundId:newFound.id,createdAt:new Date().toISOString(),read:false});
        writeNotifications(notifs);
        broadcastNotification(notifs[notifs.length-1]);

        // Async match against lost
        (async()=>{
            try{
                const allLost=readLostItems();
                if(allLost.length===0) return;
                let candidates=[...allLost].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,60);
                if(!aiConfigured ||!genAI){
                    const fallbackResults=fallbackMatch({item:itemName,location:loc,description:desc,date:dateStr}, candidates);
                    const relevant=fallbackResults.filter(r=>r.confidence>=70);
                    if(relevant.length>0){
                        const notifs2=readNotifications();
                        relevant.forEach(r=>{
                            const lost=r.foundItem; // in fallback, foundItem is actually lost
                            notifs2.push({id:Date.now()+Math.random(),type:"match_found",title:"Possible match for your report",message:`Your ${lost.item} may have been found near ${newFound.location}.`,ownerUid:lost.ownerUid,relatedLostId:lost.id,relatedFoundId:newFound.id,confidence:r.confidence,matchedFactors:r.matchedFactors,createdAt:new Date().toISOString(),read:false});
                        });
                        writeNotifications(notifs2);
                    }
                    return;
                }
                // Gemini reverse matching
                const foundEmbedding=await getGeminiEmbedding(buildFoundText(newFound));
                const embeddings=[]; const texts=[]; const idxs=[];
                for(let i=0;i<candidates.length;i++){ const l=candidates[i]; const text=buildLostText(l); const h=hashText(text); const cached=embeddingCache.get(l.id); if(cached&&cached.hash===h) embeddings[i]=cached.embedding; else{ idxs.push(i); texts.push(text); } }
                if(texts.length>0){
                    const batch=await getGeminiEmbeddingsBatch(texts);
                    for(let j=0;j<batch.length;j++){ const oi=idxs[j]; embeddings[oi]=batch[j]; embeddingCache.set(candidates[oi].id,{embedding:batch[j],hash:hashText(buildLostText(candidates[oi]))}); }
                }
                const scored=candidates.map((lost,idx)=>{ const sim=embeddings[idx]?cosineSimilarity(foundEmbedding,embeddings[idx]):0; return {lost,similarity:sim}; }).sort((a,b)=>b.similarity-a.similarity);
                let top=scored.filter(s=>s.similarity>0.5).slice(0,6); if(top.length===0) top=scored.slice(0,2);
                const strong=top.filter(s=>s.similarity>0.65).map(s=>({lostItemId:s.lost.id,confidence:Math.round(s.similarity*90),similarity:s.similarity}));
                if(strong.length>0){
                    const notifs2=readNotifications();
                    strong.forEach(s=>{
                        const lost=candidates.find(l=>l.id===s.lostItemId);
                        if(!lost) return;
                        notifs2.push({id:Date.now()+Math.random(),type:"match_found",title:"Possible match for your report",message:`Your ${lost.item} may have been found near ${newFound.location}. Possible match.`,ownerUid:lost.ownerUid,relatedLostId:lost.id,relatedFoundId:newFound.id,confidence:s.confidence,matchedFactors:["Similar item","Similar description"],createdAt:new Date().toISOString(),read:false});
                    });
                    writeNotifications(notifs2);
                    strong.forEach(s=> broadcastNotification({type:"match_found",relatedFoundId:newFound.id,relatedLostId:s.lostItemId,confidence:s.confidence}));
                }
            }catch(e){ console.error("Async found match error", e.message); }
        })();

        // Immediate relevant matches for response (for wow moment)
        let immediateRelevant=[];
        try{
            const allLost=readLostItems();
            let candidates=allLost.slice(-60);
            let scored=[];
            if(aiConfigured && genAI){
                const foundEmbedding=await getGeminiEmbedding(buildFoundText(newFound));
                const embs=[]; const txts=[]; const idxNeed=[];
                for(let i=0;i<candidates.length;i++){ const l=candidates[i]; const txt=buildLostText(l); const h=hashText(txt); const cached=embeddingCache.get(l.id); if(cached&&cached.hash===h) embs[i]=cached.embedding; else{ idxNeed.push(i); txts.push(txt); } }
                if(txts.length>0){
                    const batch=await getGeminiEmbeddingsBatch(txts);
                    for(let j=0;j<batch.length;j++){ const oi=idxNeed[j]; embs[oi]=batch[j]; }
                }
                scored=candidates.map((lost,idx)=>({lost,similarity:embs[idx]?cosineSimilarity(foundEmbedding,embs[idx]):0})).sort((a,b)=>b.similarity-a.similarity).filter(s=>s.similarity>0.65).slice(0,5).map(s=>({lostItem:candidates.find(l=>l.id===s.lost.id),confidence:Math.round(s.similarity*90),matchedFactors:["Similar item","Similar description"]}));
                immediateRelevant=scored;
            }else{
                const fallbackResults=fallbackMatch({item:itemName,location:loc,description:desc,date:dateStr}, candidates);
                immediateRelevant=fallbackResults.filter(r=>r.confidence>=70).map(r=>({lostItem:r.foundItem,confidence:r.confidence,matchedFactors:r.matchedFactors}));
            }
        }catch{}

        res.json({success:true,data:newFound,relevantMatches:immediateRelevant});
    }catch(e){ console.error("Error /api/found", e); res.status(500).json({success:false,message:"Failed to save found report"}); }
});

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
            const formatted=fallbackResults.map(r=>({ foundItemId:r.foundItem.id, foundItem:r.foundItem, confidence:r.confidence, reason:r.reason, matchedFactors:r.matchedFactors, source:"fallback" }));
            return res.json({success:true,matches:formatted,aiUsed:false,source:"fallback",message:"Gemini not configured - using deterministic fallback"});
        }
        try{
            const matches = await performGeminiMatching(lostReport, candidates);
            res.json({ success:true, matches, aiUsed:true, source:"ai", model:`${EMBEDDING_MODEL} + ${CHAT_MODEL}`, candidatesEvaluated:candidates.length });
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

app.get("/lost.html",(req,res)=>{ res.sendFile(path.join(__dirname,"lost.html")); });
app.get("/found.html",(req,res)=>{ res.sendFile(path.join(__dirname,"found.html")); });
app.get("/",(req,res)=>{ res.sendFile(path.join(__dirname,"index.html")); });
app.listen(PORT,()=>{ console.log(`CampusFind AI (Gemini + Firebase Auth) server running at http://localhost:${PORT}`); console.log(`Data: found=${readFoundItems().length} lost=${readLostItems().length} notifs=${readNotifications().length}`); console.log(`AI: ${aiConfigured?`Active Gemini (${EMBEDDING_MODEL} + ${CHAT_MODEL})`:"Fallback (no GEMINI_API_KEY)"}`); console.log(`Firebase Admin: ${firebaseAdminConfigured?"Configured":"NOT configured"}`); });