import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, ShieldCheck, LogOut, CheckCircle2 } from 'lucide-react';
import { logoutUser, authFetch, resendVerificationEmail } from '../firebase/auth.js';

export default function ProfilePage({ user }) {
  const navigate = useNavigate();
  const [myLost, setMyLost] = useState([]);
  const [resendStatus, setResendStatus] = useState(null);

  useEffect(() => {
    async function loadMyLost() {
      if (!user || !user.emailVerified) return;
      try {
        const res = await authFetch('/api/my-lost');
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setMyLost(data.data);
        }
      } catch (err) {
        console.error('Failed to load private lost reports:', err);
      }
    }
    loadMyLost();
  }, [user]);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/');
  };

  const handleResend = async () => {
    try {
      await resendVerificationEmail();
      setResendStatus('Verification email resent! Check your inbox.');
    } catch (err) {
      setResendStatus('Could not resend email.');
    }
  };

  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Not logged in.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8"
    >
      <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-soft flex flex-col sm:flex-row items-center gap-6">
        <div className="w-20 h-20 bg-gray-900 text-white font-extrabold rounded-3xl flex items-center justify-center text-2xl shadow-soft">
          {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
        </div>

        <div className="space-y-1 text-center sm:text-left flex-1">
          <h1 className="text-2xl font-black text-gray-900">{user.displayName || 'Campus Student'}</h1>
          <p className="text-xs text-gray-500 flex items-center justify-center sm:justify-start gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            <span>{user.email}</span>
          </p>
          <div className="pt-2">
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified Account
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                Unverified Email
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-5 py-2.5 bg-gray-100 hover:bg-rose-50 hover:text-primary text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>

      {!user.emailVerified && (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl space-y-3">
          <h3 className="font-bold text-amber-900 text-sm">Action Needed: Verify your email</h3>
          <p className="text-xs text-amber-700">
            A verification link was sent to {user.email}. You need a verified email to submit private lost reports.
          </p>
          <button
            onClick={handleResend}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-sm"
          >
            Resend Verification Link
          </button>
          {resendStatus && <p className="text-xs font-semibold text-amber-800">{resendStatus}</p>}
        </div>
      )}

      {/* My Lost Reports */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Your Private Lost Reports</h2>
        {myLost.length === 0 ? (
          <div className="p-8 bg-gray-50 rounded-2xl text-center border border-gray-100 text-xs text-gray-500">
            You haven't submitted any lost reports yet.
          </div>
        ) : (
          <div className="space-y-3">
            {myLost.map((item) => (
              <div key={item.id} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-soft flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-gray-900">{item.item || item.title}</h4>
                  <p className="text-xs text-gray-500">📍 {item.location} • 📅 {item.date}</p>
                </div>
                <span className="px-3 py-1 bg-rose-50 text-primary rounded-full text-xs font-bold">
                  Lost
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
