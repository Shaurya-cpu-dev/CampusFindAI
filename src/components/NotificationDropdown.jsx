import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, X, ArrowRight, ExternalLink } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.jsx';

function formatRelativeTime(dateString) {
  if (!dateString) return 'recently';
  try {
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'recently';
  }
}

export default function NotificationDropdown({ isOpen, onClose }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [tab, setTab] = useState('all');
  const navigate = useNavigate();

  if (!isOpen) return null;

  const filtered = tab === 'unread' ? notifications.filter(n => !n.read) : notifications;

  const handleItemClick = (notif) => {
    if (!notif.read) {
      markAsRead(notif.id);
    }
    onClose();
    if (notif.type === 'match_found' || notif.ownerUid) {
      navigate('/matches');
    } else {
      navigate('/');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Flyout Panel */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="absolute right-0 top-full mt-3 w-80 sm:w-96 bg-white rounded-3xl border border-gray-100 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-rose-50 text-primary rounded-xl">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-gray-900">Notifications</h3>
              <p className="text-[11px] text-gray-500">{unreadCount} unread</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5 text-secondary" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex px-4 pt-3 pb-2 gap-2 border-b border-gray-50 text-xs font-bold">
          <button
            onClick={() => setTab('all')}
            className={"px-3 py-1 rounded-xl transition-all " + (tab === 'all' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100")}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setTab('unread')}
            className={"px-3 py-1 rounded-xl transition-all " + (tab === 'unread' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100")}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* List of items */}
        <div className="overflow-y-auto divide-y divide-gray-50 flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <span className="text-3xl">🔔</span>
              <p className="text-xs font-bold text-gray-700">No {tab === 'unread' ? 'unread ' : ''}notifications</p>
              <p className="text-[11px] text-gray-400">
                New reports and matches around campus will appear here in real-time.
              </p>
            </div>
          ) : (
            filtered.map((n) => {
              const isMatch = n.type === 'match_found';
              const isFound = n.type === 'found_report';
              const isLost = n.type === 'lost_report';
              const icon = isMatch ? '🎯' : isFound ? '📦' : isLost ? '🔍' : '🔔';

              return (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={"p-3.5 hover:bg-gray-50/80 transition-all cursor-pointer flex items-start gap-3 relative " + (!n.read ? "bg-rose-50/30" : "")}
                >
                  <span className="text-xl p-1 shrink-0">{icon}</span>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={"text-xs truncate " + (!n.read ? "font-black text-gray-900" : "font-bold text-gray-700")}>
                        {n.title}
                      </h4>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className={"text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md " + (isMatch ? "bg-emerald-100 text-emerald-800" : isFound ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700")}>
                        {isMatch ? 'AI Match' : isFound ? 'Found' : isLost ? 'Lost' : 'Alert'}
                      </span>
                      {n.ownerUid && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
                          🔒 Private
                        </span>
                      )}
                    </div>
                  </div>

                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0 self-center" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/matches');
            }}
            className="text-xs font-bold text-gray-700 hover:text-primary transition-colors flex items-center justify-center gap-1 w-full"
          >
            <span>View All Match Alerts</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </>
  );
}
