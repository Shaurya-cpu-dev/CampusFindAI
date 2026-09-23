import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Footer from './components/Footer.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import HomePage from './pages/HomePage.jsx';
import ReportLostPage from './pages/ReportLostPage.jsx';
import ReportFoundPage from './pages/ReportFoundPage.jsx';
import MyMatchesPage from './pages/MyMatchesPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DevPage from './pages/DevPage.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import ChatsPage from './pages/ChatsPage.jsx';
import { onAuth } from './firebase/auth.js';
import { NotificationProvider } from './context/NotificationContext.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();

  useEffect(() => {
    const unsub = onAuth((u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  return (
    <NotificationProvider user={user}>
      <div className="min-h-screen bg-white flex flex-col justify-between">
        <div>
          <Navbar user={user} searchQuery={searchQuery} onSearch={setSearchQuery} />
          <NotificationToast />
          <main>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<HomePage searchQuery={searchQuery} onSearch={setSearchQuery} />} />
              <Route path="/community" element={<CommunityPage user={user} />} />
              <Route path="/chats" element={<ChatsPage user={user} />} />
              <Route path="/report/lost" element={<ReportLostPage user={user} />} />
              <Route path="/report/found" element={<ReportFoundPage />} />
              <Route path="/matches" element={<MyMatchesPage user={user} />} />
              <Route path="/profile" element={<ProfilePage user={user} />} />
              <Route path="/dev" element={<DevPage />} />
            </Routes>
          </main>
        </div>

        <Footer />
        <BottomNav />
      </div>
    </NotificationProvider>
  );
}
