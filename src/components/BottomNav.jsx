import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, PlusCircle, Heart, User } from 'lucide-react';

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 px-6 py-2 flex items-center justify-around shadow-lg">
      <NavLink
        to="/"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[11px] font-bold transition-all " +
          (isActive ? "text-primary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <Home className="w-5 h-5" />
        <span>Feed</span>
      </NavLink>

      <NavLink
        to="/report/found"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[11px] font-bold transition-all " +
          (isActive ? "text-secondary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <PlusCircle className="w-5 h-5 text-secondary" />
        <span>Found</span>
      </NavLink>

      <NavLink
        to="/matches"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[11px] font-bold transition-all " +
          (isActive ? "text-primary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <Heart className="w-5 h-5" />
        <span>Matches</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[11px] font-bold transition-all " +
          (isActive ? "text-gray-900" : "text-gray-400 hover:text-gray-600")
        }
      >
        <User className="w-5 h-5" />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}
