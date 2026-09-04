import React, { useState } from 'react';
import { X, Mail, Lock, User, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { loginUser, registerUser, resendVerificationEmail } from '../firebase/auth.js';

export default function AuthModal({ isOpen, onClose, defaultTab = 'login', onAuthSuccess }) {
  if (!isOpen) return null;

  const [tab, setTab] = useState(defaultTab);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showResend, setShowResend] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (tab === 'register') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        const user = await registerUser({ nickname, email, password });
        setSuccess("Account created! A verification email has been sent to " + email + ". Please check your inbox and verify your email.");
        setShowResend(true);
      } else {
        const user = await loginUser(email, password);
        if (!user.emailVerified) {
          setError("Email " + email + " is not verified. Please verify using the link sent to your inbox before reporting lost items.");
          setShowResend(true);
        } else {
          setSuccess("Welcome back, " + (user.displayName || user.email) + "!");
          setTimeout(() => {
            if (onAuthSuccess) onAuthSuccess(user);
            onClose();
          }, 600);
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendVerificationEmail();
      setSuccess('Verification email resent! Check your inbox.');
    } catch (err) {
      setError(err.message || 'Could not resend email.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-700 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-gray-900 text-white font-extrabold rounded-2xl mb-3 shadow-soft">
            CF
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900">
            {tab === 'login' ? 'Welcome Back' : 'Create Student Account'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {tab === 'login' ? 'Sign in to access your matches and reports' : 'Join your campus lost & found network'}
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(null); setSuccess(null); }}
            className={"flex-1 py-2 text-xs font-bold rounded-xl transition-all " + (tab === 'login' ? "bg-white shadow-soft text-gray-900" : "text-gray-500 hover:text-gray-800")}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(null); setSuccess(null); }}
            className={"flex-1 py-2 text-xs font-bold rounded-xl transition-all " + (tab === 'register' ? "bg-white shadow-soft text-gray-900" : "text-gray-500 hover:text-gray-800")}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nickname / Name</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Campus Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campus.edu"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gray-900 hover:bg-black text-white font-extrabold rounded-2xl transition-all shadow-soft flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {showResend && (
          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
            <button
              onClick={handleResend}
              type="button"
              className="text-xs font-bold text-primary hover:underline"
            >
              Didn't receive link? Resend Verification Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
