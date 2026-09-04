import React, { useState } from 'react';
import { UploadCloud, X, Loader2 } from 'lucide-react';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'v6m777sp';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'CampusFindAi';

export default function CloudinaryUploader({ onUpload, onRemove, initialUrl = '' }) {
  const [preview, setPreview] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, and WebP images are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit. Please choose a smaller image.');
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
      const res = await fetch("https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/image/upload", {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.secure_url) {
        throw new Error(data.error?.message || 'Upload failed. Please try again.');
      }

      setPreview(data.secure_url);
      if (onUpload) onUpload(data.secure_url);
    } catch (err) {
      setError(err.message || 'Failed to upload photo to Cloudinary.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    setPreview('');
    setError(null);
    if (onRemove) onRemove();
    if (onUpload) onUpload('');
  };

  return (
    <div className="w-full">
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 max-h-72 flex items-center justify-center group shadow-soft">
          <img
            src={preview}
            alt="Upload Preview"
            className="w-full h-64 object-cover rounded-2xl"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-all shadow-md"
            title="Remove photo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={"border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer " + (dragOver ? "border-primary bg-rose-50/50" : "border-gray-200 hover:border-gray-300 bg-gray-50/60")}
          onClick={() => document.getElementById('cloudinary-file-input')?.click()}
        >
          <input
            id="cloudinary-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={uploading}
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="p-3 bg-white rounded-full shadow-soft text-primary">
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : (
                <UploadCloud className="w-6 h-6" />
              )}
            </div>
            <div className="text-sm font-semibold text-gray-800">
              {uploading ? 'Uploading image to Cloudinary...' : 'Click to upload or drag & drop'}
            </div>
            <p className="text-xs text-gray-400">
              PNG, JPG, or WebP up to 5MB (Free Cloudinary CDN)
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-500 font-medium">{error}</p>
      )}
    </div>
  );
}
