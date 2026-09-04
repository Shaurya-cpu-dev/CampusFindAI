import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, UploadCloud, X } from "lucide-react";

const CATEGORIES = ["Backpack", "Electronics", "Cards", "Books", "Bottles", "Keys", "Others"];
const LOCATIONS = ["Library", "Canteen", "Classroom", "Ground", "Washroom", "Hostel", "Auditorium", "Lab", "Other"];

export default function ReportFoundPage() {
  const [category, setCategory] = useState("Backpack");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("Library");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportSuccess, setReportSuccess] = useState(null);
  const [relevantMatches, setRelevantMatches] = useState([]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      setPhotoError("Only JPG, PNG, and WebP images are allowed.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("File size exceeds 10MB limit. Please choose a smaller image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let dataUrl = event.target.result;
      // Compress image if needed
      try {
        dataUrl = await compressImage(dataUrl, 1280, 0.75);
      } catch (err) {
        console.warn("Image compression failed, using original:", err);
      }
      setPhotoData(dataUrl);
      setPhotoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const compressImage = (dataUrl, maxWidth, quality) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = dataUrl;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        item: title.trim(),
        location: location.trim(),
        date,
        description: description.trim(),
        photo: photoData || ""
      };

      const res = await fetch("/api/found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit found report.");
      }

      setReportSuccess(data.data);
      setRelevantMatches(data.relevantMatches || []);
    } catch (err) {
      setError(err.message || "Error submitting report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto px-4 sm:px-6 py-8"
    >
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to feed</span>
      </Link>

      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-secondary text-xs font-bold mb-2">
          <span>Public Report • No Login Required</span>
        </div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Report Found Item</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Found something on campus? Post it here so the rightful owner can recover it.
        </p>
      </div>

      {reportSuccess ? (
        <div className="space-y-6">
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-bold text-gray-900">Found Item Published!</h3>
            <p className="text-xs text-gray-600">
              Report #{reportSuccess.id} is live on the campus feed.
            </p>
          </div>

          {relevantMatches.length > 0 && (
            <div className="p-4 bg-white border border-emerald-200 rounded-2xl shadow-soft space-y-2">
              <h4 className="text-sm font-bold text-emerald-800">🎯 {relevantMatches.length} Private Owner(s) Notified</h4>
              <p className="text-xs text-gray-600">
                High-confidence matches were detected and the lost item owners have been notified privately.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setReportSuccess(null); setTitle(""); setDescription(""); setPhotoData(""); setPhotoPreview(""); }}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs"
            >
              Report Another Item
            </button>
            <Link
              to="/"
              className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-xs text-center"
            >
              Back to Home Feed
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-soft space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-secondary/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Location *</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-secondary/20"
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Item Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Blue Hydro Flask Water Bottle"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Date Found *</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Description *</label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe where it was found, color, condition, where it's being kept (e.g. security desk)..."
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Photo (Optional) - Up to 10MB</label>
            <div className="relative">
              {photoPreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 max-h-72 flex items-center justify-center group shadow-soft">
                  <img
                    src={photoPreview}
                    alt="Photo Preview"
                    className="w-full h-64 object-cover rounded-2xl"
                  />
                  <button
                    type="button"
                    onClick={() => { setPhotoData(""); setPhotoPreview(""); }}
                    className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-all shadow-md"
                    title="Remove photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  className="cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition-all hover:border-gray-300 bg-gray-50/60"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoChange}
                    disabled={loading}
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="p-3 bg-white rounded-full shadow-soft text-primary">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-gray-800">
                      Click to upload or drag & drop
                    </div>
                    <p className="text-xs text-gray-400">
                      PNG, JPG, or WebP up to 10MB (auto-compressed)
                    </p>
                  </div>
                </label>
              )}
              {photoError && <p className="mt-2 text-xs text-rose-500 font-medium">{photoError}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-secondary hover:bg-[#00b248] text-white font-extrabold rounded-2xl transition-all shadow-soft flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Report Found Item → Post to Feed"}
          </button>
        </form>
      )}
    </motion.div>
  );
}