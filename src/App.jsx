import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Footer from './components/Footer.jsx';
import HomePage from './pages/HomePage.jsx';
import ReportLostPage from './pages/ReportLostPage.jsx';
import ReportFoundPage from './pages/ReportFoundPage.jsx';
import MyMatchesPage from './pages/MyMatchesPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DevPage from './pages/DevPage.jsx';
import { onAuth } from './firebase/auth.js';

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
    <div className="min-h-screen bg-white flex flex-col justify-between">
      <div>
        <Navbar user={user} searchQuery={searchQuery} onSearch={setSearchQuery} />
        <main>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomePage searchQuery={searchQuery} onSearch={setSearchQuery} />} />
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
  );
}
