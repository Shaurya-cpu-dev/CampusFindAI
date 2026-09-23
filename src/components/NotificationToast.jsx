import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Bell, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function NotificationToast() {
  const { activeToast, dismissToast } = useNotifications();
  const navigate = useNavigate();

  if (!activeToast) return null;

  const isMatch = activeToast.type === 'match_found';
  const isFound = activeToast.type === 'found_report';
  const isLost = activeToast.type === 'lost_report';

  const icon = isMatch ? '🎯' : isFound ? '📦' : isLost ? '🔍' : '🔔';
  const bgClass = isMatch
    ? 'bg-emerald-950 text-white border-emerald-500/40'
    : isFound
    ? 'bg-gray-900 text-white border-secondary/40'
    : 'bg-gray-900 text-white border-primary/40';

  const handleClick = () => {
    dismissToast();
    if (isMatch) {
      navigate('/matches');
    } else {
      navigate('/');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -40, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 z-50 sm:max-w-md w-auto"
      >
        <div
          onClick={handleClick}
          className={"flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-md cursor-pointer transition-all hover:scale-[1.01] " + bgClass}
        >
          <div className="text-2xl shrink-0 p-1.5 rounded-xl bg-white/10 flex items-center justify-center">
            {icon}
          </div>

          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-white/90">
                {isMatch ? 'AI Match Alert' : isFound ? 'Found Item Live' : isLost ? 'Lost Item Reported' : 'Campus Alert'}
              </span>
              <span className="text-[10px] text-white/50">Just now</span>
            </div>
            <h4 className="font-bold text-sm text-white truncate">{activeToast.title}</h4>
            <p className="text-xs text-white/80 line-clamp-2 mt-0.5">{activeToast.message}</p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast();
            }}
            className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
