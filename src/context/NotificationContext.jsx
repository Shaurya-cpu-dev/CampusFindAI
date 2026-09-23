import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authFetch, getIdToken } from '../firebase/auth.js';

const NotificationContext = createContext(null);

export function NotificationProvider({ children, user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeToast, setActiveToast] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await authFetch('/api/notifications');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setNotifications(json.data);
        setUnreadCount(json.filteredUnread || json.unreadCount || 0);
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  }, []);

  // Mark single notification as read
  const markAsRead = async (id) => {
    try {
      await authFetch('/api/notifications/' + id + '/read', { method: 'POST' });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      await authFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  // Setup SSE stream for real-time notifications
  useEffect(() => {
    fetchNotifications();

    let evtSource = null;
    let pollInterval = null;

    async function initStream() {
      if (evtSource) {
        evtSource.close();
        evtSource = null;
      }
      try {
        const token = await getIdToken();
        const url = token ? '/api/notifications/stream?token=' + encodeURIComponent(token) : '/api/notifications/stream';
        evtSource = new EventSource(url);

        evtSource.onmessage = (event) => {
          try {
            const notif = JSON.parse(event.data);
            if (notif.type && notif.type !== 'connected') {
              // Prepend newly received notification
              setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)]);
              setUnreadCount(prev => prev + 1);

              // Trigger real-time top toast banner
              setActiveToast({
                id: notif.id || Date.now(),
                type: notif.type,
                title: notif.title || 'New Notification',
                message: notif.message || 'A new update occurred on campus.',
                ownerUid: notif.ownerUid
              });

              // Re-fetch to synchronize state
              fetchNotifications();
            }
          } catch (err) {
            console.error('Error parsing SSE event:', err);
          }
        };

        evtSource.onerror = () => {
          if (evtSource) evtSource.close();
          evtSource = null;
        };
      } catch (err) {
        console.error('Failed to establish SSE stream:', err);
      }
    }

    initStream();

    // Fallback polling every 8 seconds so tests and live events are always synced
    pollInterval = setInterval(fetchNotifications, 8000);

    return () => {
      if (evtSource) evtSource.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [user, fetchNotifications]);

  // Auto-dismiss toast banner after 6 seconds
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        activeToast,
        dismissToast: () => setActiveToast(null),
        markAsRead,
        markAllAsRead,
        refresh: fetchNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext) || {
    notifications: [],
    unreadCount: 0,
    activeToast: null,
    dismissToast: () => {},
    markAsRead: () => {},
    markAllAsRead: () => {},
    refresh: () => {}
  };
}
