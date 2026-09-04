import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 pt-12 pb-24 md:pb-12 text-center text-xs text-gray-500">
      <div className="max-w-7xl mx-auto px-4 space-y-4">
        <div className="flex flex-wrap justify-center gap-6 font-semibold text-gray-600">
          <Link to="/" className="hover:text-primary transition-colors">Home Feed</Link>
          <Link to="/report/lost" className="hover:text-primary transition-colors">Report Lost</Link>
          <Link to="/report/found" className="hover:text-secondary transition-colors">Report Found</Link>
          <Link to="/matches" className="hover:text-primary transition-colors">My Matches</Link>
          <Link to="/dev" className="hover:text-gray-900 transition-colors">Developer Console (/dev)</Link>
          <a href="https://github.com/Shaurya-cpu-dev/CampusFindAI" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">GitHub</a>
        </div>

        <div className="flex items-center justify-center gap-1 text-gray-400 pt-2">
          <span>Made for Students with</span>
          <Heart className="w-3.5 h-3.5 text-primary fill-primary" />
          <span>• CampusFind AI</span>
        </div>
      </div>
    </footer>
  );
}
