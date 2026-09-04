import React from 'react';
import { X, MapPin, Calendar, ShieldCheck } from 'lucide-react';

export default function DetailModal({ item, onClose }) {
  if (!item) return null;
  const isFound = item.status === 'found';
  const imgUrl = item.imageUrl || item.photo;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {imgUrl ? (
          <div className="relative h-64 bg-gray-900 shrink-0">
            <img
              src={imgUrl}
              alt={item.item || item.title}
              className="w-full h-full object-cover"
            />
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2.5 bg-black/60 hover:bg-black text-white rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="p-4 border-b flex justify-end">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        )}

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center gap-2">
            <span className={"px-3 py-1 rounded-full text-xs font-extrabold uppercase " + (isFound ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
              {isFound ? 'Found Item' : 'Lost Item'}
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
              {item.category || 'Item'}
            </span>
          </div>

          <h2 className="text-2xl font-extrabold text-gray-900 leading-tight">
            {item.item || item.title}
          </h2>

          <div className="grid grid-cols-2 gap-3 py-3 border-y border-gray-100 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{item.location}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-secondary shrink-0" />
              <span>{item.date || 'Recent'}</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Description</h4>
            <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
              {item.description || 'No additional details provided.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>Campus Privacy Promise:</strong> We never show student emails or phone numbers on the public feed. AI matches notify owners securely.
            </p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-sm transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
