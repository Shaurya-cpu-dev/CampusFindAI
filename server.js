const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve your CampusFind frontend
app.use(express.static(__dirname));

// Serve public folder
app.use("/public", express.static(path.join(__dirname, "public")));

// =========================
// SIMPLE LOCAL STORAGE - JSON FILE DB
// Beginner-friendly, survives restarts
// =========================
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "foundItems.json");

function ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }
}

function readFoundItems() {
    try {
        ensureDataFile();
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error("Error reading data file:", err);
        return [];
    }
}

function writeFoundItems(items) {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

ensureDataFile();

// Test route
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "CampusFind AI backend is running"
    });
});

// GET found items - shared storage
app.get("/api/found", (req, res) => {
    try {
        const items = readFoundItems();
        res.json({
            success: true,
            count: items.length,
            data: items
        });
    } catch (error) {
        console.error("Error reading reports:", error);
        res.status(500).json({
            success: false,
            message: "Could not load reports."
        });
    }
});

// POST found item - with validation
app.post("/api/found", (req, res) => {
    try {
        const { id, item, location, date, dateTime, description, photo } = req.body;

        // Validation
        if (!item || typeof item !== "string" || item.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Item name is required." });
        }
        if (!location || typeof location !== "string" || location.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Location is required." });
        }
        if (!date || typeof date !== "string" || date.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Date is required." });
        }
        if (!description || typeof description !== "string" || description.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Description is required." });
        }
        if (item.trim().length > 100) {
            return res.status(400).json({ success: false, message: "Item name too long (max 100)." });
        }
        if (location.trim().length > 150) {
            return res.status(400).json({ success: false, message: "Location too long (max 150)." });
        }
        if (description.trim().length > 1000) {
            return res.status(400).json({ success: false, message: "Description too long (max 1000)." });
        }
        if (photo && typeof photo === "string" && photo.length > 7 * 1024 * 1024) { // ~5MB base64 ~ 7MB string
            return res.status(400).json({ success: false, message: "Photo too large. Max ~2MB image." });
        }

        const newItem = {
            id: id ? Number(id) : Date.now(),
            item: item.trim(),
            location: location.trim(),
            date: date.trim(),
            dateTime: (dateTime || "").trim(),
            description: description.trim(),
            photo: photo || "",
            createdAt: new Date().toISOString()
        };

        const items = readFoundItems();
        items.push(newItem);
        writeFoundItems(items);

        console.log("Saved found item:", newItem.id, newItem.item);

        res.json({
            success: true,
            message: "Report saved successfully!",
            data: newItem
        });

    } catch (error) {
        console.error("Error saving report:", error);
        res.status(500).json({
            success: false,
            message: "Could not save the report."
        });
    }
});

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(PORT, () => {
    console.log(`CampusFind AI server running at http://localhost:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
});