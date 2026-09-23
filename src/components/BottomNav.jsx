import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, PlusCircle, Radio, MessageSquare, User } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function BottomNav() {
  const { unreadCount } = useNotifications();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 px-3 py-2 flex items-center justify-around shadow-lg">
      <NavLink
        to="/"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[10px] font-bold transition-all " +
          (isActive ? "text-primary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <Home className="w-5 h-5" />
        <span>Feed</span>
      </NavLink>

      <NavLink
        to="/community"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[10px] font-bold transition-all " +
          (isActive ? "text-primary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <Radio className="w-5 h-5" />
        <span>Buzz</span>
      </NavLink>

      <NavLink
        to="/report/found"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[10px] font-bold transition-all " +
          (isActive ? "text-secondary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <PlusCircle className="w-5 h-5 text-secondary" />
        <span>Found</span>
      </NavLink>

      <NavLink
        to="/chats"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[10px] font-bold transition-all relative " +
          (isActive ? "text-primary" : "text-gray-400 hover:text-gray-600")
        }
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] bg-primary text-white text-[9px] font-black rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <span>Chats</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) =>
          "flex flex-col items-center gap-1 text-[10px] font-bold transition-all " +
          (isActive ? "text-gray-900" : "text-gray-400 hover:text-gray-600")
        }
      >
        <User className="w-5 h-5" />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}
