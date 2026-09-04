import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Terminal, Bell } from 'lucide-react';
import AuthModal from './AuthModal.jsx';

export default function Navbar({ user, onSearch, searchQuery = '' }) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 bg-gray-900 text-white font-extrabold rounded-2xl flex items-center justify-center shadow-soft">
              CF
            </div>
            <div>
              <span className="font-extrabold text-lg text-gray-900 tracking-tight">CampusFind</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black uppercase bg-rose-50 text-primary border border-rose-200 rounded-md">AI</span>
            </div>
          </NavLink>

          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch && onSearch(e.target.value)}
              placeholder="Search items, keywords, locations..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 rounded-2xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NavLink
              to="/matches"
              className={({ isActive }) =>
                "px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all " +
                (isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50")
              }
            >
              <Bell className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline">My Matches</span>
            </NavLink>

            <NavLink
              to="/dev"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all"
              title="Developer API & Diagnostics"
            >
              <Terminal className="w-4 h-4" />
            </NavLink>

            {user ? (
              <NavLink
                to="/profile"
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full sm:rounded-2xl transition-all"
              >
                <div className="w-7 h-7 bg-primary text-white font-bold rounded-full flex items-center justify-center text-xs">
                  {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                </div>
                <span className="hidden sm:inline text-xs font-bold text-gray-800">
                  {user.displayName || 'Account'}
                </span>
              </NavLink>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-extrabold rounded-2xl transition-all shadow-soft"
              >
                Login / Sign up
              </button>
            )}
          </div>
        </div>
      </header>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
