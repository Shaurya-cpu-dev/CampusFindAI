import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, AlertTriangle, MapPin, Clock, Send, CheckCircle2, Sparkles, Filter, RefreshCw, Image as ImageIcon, Check } from 'lucide-react';
import CloudinaryUploader from '../components/CloudinaryUploader.jsx';

export default function CommunityPage({ user }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('All');
  const [isPosting, setIsPosting] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState(null);

  // Form states
  const [content, setContent] = useState('');
  const [type, setType] = useState('lost_alert');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [authorName, setAuthorName] = useState(user?.displayName || '');
  const [replyText, setReplyText] = useState({});
  const [submittingReply, setSubmittingReply] = useState({});

  async function fetchAlerts() {
    try {
      setLoading(true);
      const res = await fetch('/api/community/alerts');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAlerts(data.data);
      }
    } catch (err) {
      console.error('Failed to load community alerts:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000); // Polling sync every 15s
    return () => clearInterval(interval);
  }, []);

  async function handlePostAlert(e) {
    e.preventDefault();
    if (!content.trim()) return;

    try {
      setIsPosting(true);
      let headers = { 'Content-Type': 'application/json' };
      if (user) {
        const token = await user.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/community/alerts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content,
          type,
          location: location || 'Campus',
          imageUrl,
          authorName: user?.displayName || authorName || 'Student'
        })
      });

      const data = await res.json();
      if (data.success) {
        setContent('');
        setLocation('');
        setImageUrl('');
        fetchAlerts();
      } else {
        alert(data.message || 'Failed to post alert');
      }
    } catch (err) {
      console.error('Error posting alert:', err);
      alert('Error posting alert. Please check your network.');
    } finally {
      setIsPosting(false);
    }
  }

  async function handleAddReply(alertId) {
    const text = (replyText[alertId] || '').trim();
    if (!text) return;

    try {
      setSubmittingReply({ ...submittingReply, [alertId]: true });
      let headers = { 'Content-Type': 'application/json' };
      if (user) {
        const token = await user.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/community/alerts/${alertId}/reply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: text,
          authorName: user?.displayName || 'Student'
        })
      });

      const data = await res.json();
      if (data.success) {
        setReplyText({ ...replyText, [alertId]: '' });
        fetchAlerts();
      } else {
        alert(data.message || 'Failed to reply');
      }
    } catch (err) {
      console.error('Reply error:', err);
    } finally {
      setSubmittingReply({ ...submittingReply, [alertId]: false });
    }
  }

  async function handleResolveAlert(alertId) {
    if (!user) {
      alert('Please log in to resolve your alert.');
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/community/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        fetchAlerts();
      } else {
        alert(data.message || 'Could not resolve alert');
      }
    } catch (err) {
      console.error('Resolve error:', err);
    }
  }

  const filteredAlerts = alerts.filter(a => {
    if (filterType === 'All') return true;
    if (filterType === 'Lost') return a.type === 'lost_alert';
    if (filterType === 'Found') return a.type === 'found_alert';
    if (filterType === 'Urgent') return a.type === 'urgent';
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 py-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-xs font-bold text-primary mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Campus Live Broadcast</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            Campus Buzz & Alerts
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Real-time lost & found broadcasts. Share instant sightings or ask campus peers directly.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-2xl border border-gray-200 transition-all flex items-center gap-2 text-xs font-bold self-start sm:self-auto"
        >
          <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Post Alert Card */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-soft mb-8">
        <h2 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <span>Post an Instant Campus Alert</span>
        </h2>

        <form onSubmit={handlePostAlert} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'lost_alert', label: '🔍 Lost Alert', color: 'bg-rose-50 text-rose-700 border-rose-200' },
              { id: 'found_alert', label: '📦 Found Alert', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { id: 'urgent', label: '⚡ Urgent Sighting', color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { id: 'general_alert', label: '💬 General Notice', color: 'bg-blue-50 text-blue-700 border-blue-200' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={"px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all " + (type === t.id ? t.color + " ring-2 ring-primary/20 scale-105" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100")}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did you lose or find? (e.g. 'Left my blue spiral notebook on the 3rd floor library desk 10 mins ago!')"
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (e.g. Library 3rd Floor, Canteen)"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {!user && (
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your Name or Nickname (optional)"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            )}
          </div>

          {/* Optional Cloudinary Photo */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Optional Photo</label>
            <CloudinaryUploader
              value={imageUrl}
              onChange={setImageUrl}
              label="Drop alert photo here"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isPosting || !content.trim()}
              className="px-6 py-3 bg-primary hover:bg-[#ff4349] disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm shadow-soft transition-all flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{isPosting ? 'Broadcasting...' : 'Broadcast Alert'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        <Filter className="w-4 h-4 text-gray-400 shrink-0" />
        {['All', 'Lost', 'Found', 'Urgent'].map(f => (
          <button
            key={f}
            onClick={() => setFilterType(f)}
            className={"px-4 py-1.5 rounded-full text-xs font-extrabold transition-all " + (filterType === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 font-bold">{filteredAlerts.length} alerts</span>
      </div>

      {/* Alert Feed */}
      {loading && alerts.length === 0 ? (
        <div className="p-12 text-center text-gray-400 space-y-2">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium">Loading live campus alerts...</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-12 text-center bg-gray-50 rounded-3xl border border-gray-100">
          <p className="text-gray-500 font-bold">No active alerts found in this category.</p>
          <p className="text-xs text-gray-400 mt-1">Be the first to post a campus lost or found alert above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map(alertItem => {
            const isResolved = alertItem.resolved;
            const isAuthor = user && alertItem.authorUid === user.uid;

            return (
              <div
                key={alertItem.id}
                className={"bg-white rounded-3xl border p-5 sm:p-6 transition-all shadow-soft hover:shadow-soft-lg " + (isResolved ? "border-emerald-200 bg-emerald-50/20" : "border-gray-200")}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-gray-100 text-gray-800 font-extrabold flex items-center justify-center text-sm shadow-inner">
                      {alertItem.authorName ? alertItem.authorName[0].toUpperCase() : 'S'}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-gray-900">{alertItem.authorName}</span>
                        {alertItem.authorVerified && (
                          <span className="p-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px]" title="Verified Student">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span>{alertItem.location}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(alertItem.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={"px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider " + (
                      alertItem.type === 'lost_alert' ? 'bg-rose-100 text-rose-800' :
                      alertItem.type === 'found_alert' ? 'bg-emerald-100 text-emerald-800' :
                      alertItem.type === 'urgent' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    )}>
                      {alertItem.type.replace('_alert', '')}
                    </span>

                    {isResolved && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Resolved</span>
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-gray-800 text-sm sm:text-base leading-relaxed whitespace-pre-wrap mb-3">
                  {alertItem.content}
                </p>

                {alertItem.imageUrl && (
                  <div className="my-3 rounded-2xl overflow-hidden max-h-72 bg-gray-100 border border-gray-200">
                    <img
                      src={alertItem.imageUrl}
                      alt="Alert attachment"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                  <button
                    onClick={() => setExpandedAlert(expandedAlert === alertItem.id ? null : alertItem.id)}
                    className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 font-bold transition-all"
                  >
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span>{alertItem.replies?.length || 0} Replies</span>
                  </button>

                  {isAuthor && !isResolved && (
                    <button
                      onClick={() => handleResolveAlert(alertItem.id)}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold transition-all flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Resolved</span>
                    </button>
                  )}
                </div>

                {/* Collapsible Reply Thread */}
                {expandedAlert === alertItem.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                    {alertItem.replies && alertItem.replies.length > 0 && (
                      <div className="space-y-2.5 mb-3">
                        {alertItem.replies.map(reply => (
                          <div key={reply.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-extrabold text-gray-900">{reply.authorName}</span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-gray-700 leading-relaxed">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyText[alertItem.id] || ''}
                        onChange={(e) => setReplyText({ ...replyText, [alertItem.id]: e.target.value })}
                        placeholder="Write a helpful reply or update..."
                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddReply(alertItem.id)}
                      />
                      <button
                        onClick={() => handleAddReply(alertItem.id)}
                        disabled={submittingReply[alertItem.id] || !(replyText[alertItem.id] || '').trim()}
                        className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-all flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Reply</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
