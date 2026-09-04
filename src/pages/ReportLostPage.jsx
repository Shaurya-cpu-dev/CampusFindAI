import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import CloudinaryUploader from '../components/CloudinaryUploader.jsx';
import AuthModal from '../components/AuthModal.jsx';
import { authFetch } from '../firebase/auth.js';

const CATEGORIES = ['Backpack', 'Electronics', 'Cards', 'Books', 'Bottles', 'Keys', 'Others'];
const LOCATIONS = ['Library', 'Canteen', 'Classroom', 'Ground', 'Washroom', 'Hostel', 'Auditorium', 'Lab', 'Other'];

export default function ReportLostPage({ user }) {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [category, setCategory] = useState('Backpack');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('Library');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState(null);
  const [reportSuccess, setReportSuccess] = useState(null);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-soft max-w-md w-full text-center space-y-4 border border-gray-100">
          <div className="w-12 h-12 bg-rose-50 text-primary font-bold rounded-2xl flex items-center justify-center mx-auto text-xl">
            🔒
          </div>
          <h2 className="text-2xl font-black text-gray-900">Sign in to report lost item</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            To protect your privacy and ensure only you receive match notifications, reporting lost items requires a verified campus student account.
          </p>
          <button
            onClick={() => setAuthOpen(true)}
            className="w-full py-3 bg-gray-900 hover:bg-black text-white font-extrabold rounded-2xl transition-all shadow-soft"
          >
            Sign In / Register
          </button>
          <Link to="/" className="block text-xs font-bold text-gray-400 hover:text-gray-600 pt-2">
            ← Back to Home
          </Link>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-soft max-w-md w-full text-center space-y-4 border border-gray-100">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 font-bold rounded-2xl flex items-center justify-center mx-auto text-xl">
            ✉️
          </div>
          <h2 className="text-2xl font-black text-gray-900">Verify your campus email</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Please check your inbox at <strong>{user.email}</strong> and click the verification link before submitting a lost report.
          </p>
          <Link
            to="/profile"
            className="block w-full py-3 bg-gray-900 hover:bg-black text-white font-extrabold rounded-2xl transition-all shadow-soft text-center"
          >
            Go to Profile / Resend Link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        category,
        title: title.trim(),
        item: title.trim(),
        location: location.trim(),
        date,
        description: description.trim(),
        imageUrl: imageUrl || ''
      };

      const res = await authFetch('/api/lost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit report.');
      }

      setReportSuccess(data.data);
      setMatches(data.relevantMatches || []);
    } catch (err) {
      setError(err.message || 'Error submitting report.');
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-primary text-xs font-bold mb-2">
          <span>Private Report</span>
        </div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Report Lost Item</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Tell us about what you lost. Our Gemini matching engine will instantly scan records.
        </p>
      </div>

      {reportSuccess ? (
        <div className="space-y-6">
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-bold text-gray-900">Lost Report Saved Privately!</h3>
            <p className="text-xs text-gray-600">
              Report #{reportSuccess.id} is stored. You'll receive real-time notifications when a match is found.
            </p>
          </div>

          {matches && matches.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900">🎯 High Confidence Matches Found ({matches.length})</h3>
              {matches.map((m, idx) => (
                <div key={idx} className="p-4 bg-white border border-emerald-200 rounded-2xl shadow-soft flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">{m.foundItem?.item || m.foundItem?.title}</h4>
                    <p className="text-xs text-gray-500">📍 {m.foundItem?.location} • 📅 {m.foundItem?.date}</p>
                    <p className="text-xs text-emerald-700 font-medium mt-1">💡 {m.reason}</p>
                  </div>
                  <div className="px-3 py-1.5 bg-emerald-500 text-white font-extrabold rounded-full text-xs">
                    {m.confidence}%
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setReportSuccess(null); setTitle(''); setDescription(''); setImageUrl(''); }}
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
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Item Name / Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Black Dell Laptop Charger with round pin"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Date Lost *</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Detailed Description *</label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe color, brand, stickers, scratches, marks, or distinguishing features..."
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Photo (Optional)</label>
            <CloudinaryUploader onUpload={setImageUrl} onRemove={() => setImageUrl('')} initialUrl={imageUrl} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-primary hover:bg-[#ff4349] text-white font-extrabold rounded-2xl transition-all shadow-soft flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Report Lost Item → Scan AI Matches'}
          </button>
        </form>
      )}
    </motion.div>
  );
}
