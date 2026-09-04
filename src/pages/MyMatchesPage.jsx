import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Sparkles, CheckCircle2, MessageCircle } from 'lucide-react';
import { authFetch } from '../firebase/auth.js';
import AuthModal from '../components/AuthModal.jsx';

export default function MyMatchesPage({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    async function loadMatches() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await authFetch('/api/notifications/private');
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setNotifications(data.data);
        }
      } catch (err) {
        console.error('Failed to load matches:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-soft max-w-md w-full text-center space-y-4 border border-gray-100">
          <div className="w-12 h-12 bg-rose-50 text-primary font-bold rounded-2xl flex items-center justify-center mx-auto text-xl">
            🔒
          </div>
          <h2 className="text-2xl font-black text-gray-900">Sign in to view matches</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your match notifications are private and securely linked to your verified account.
          </p>
          <button
            onClick={() => setAuthOpen(true)}
            className="w-full py-3 bg-gray-900 hover:bg-black text-white font-extrabold rounded-2xl transition-all shadow-soft"
          >
            Sign In / Register
          </button>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 py-8 min-h-[70vh]"
    >
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-primary text-xs font-bold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Gemini Match Alerts</span>
        </div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">My Private Matches</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Real-time AI matches detected for your lost reports.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-gray-100 rounded-2xl h-24 animate-pulse"></div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-gray-50 rounded-3xl p-12 text-center border border-dashed border-gray-200 space-y-4">
          <div className="text-4xl">🔔</div>
          <h3 className="text-lg font-bold text-gray-900">No Match Alerts Yet</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            When someone reports a found item matching your lost report with 70%+ confidence, it will appear here automatically.
          </p>
          <Link
            to="/report/lost"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-bold rounded-xl text-xs shadow-soft"
          >
            Report a Lost Item
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className="bg-white border border-gray-100 rounded-2xl p-5 shadow-soft hover:shadow-soft-lg transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full">
                    MATCH ALERT
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(notif.createdAt).toLocaleString()}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-base">{notif.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{notif.message}</p>
              </div>

              <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto">
                <Link
                  to="/"
                  className="w-full sm:w-auto px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl text-center shadow-soft"
                >
                  View in Feed
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
