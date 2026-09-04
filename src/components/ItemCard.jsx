import React from 'react';
import { MapPin, Clock } from 'lucide-react';

const CATEGORY_ICONS = {
  Backpack: '🎒',
  Electronics: '📱',
  Cards: '💳',
  Books: '📚',
  Bottles: '🧴',
  Keys: '🔑',
  Others: '📦'
};

const CATEGORY_COLORS = {
  Backpack: 'bg-amber-50 text-amber-700 border-amber-200',
  Electronics: 'bg-blue-50 text-blue-700 border-blue-200',
  Cards: 'bg-purple-50 text-purple-700 border-purple-200',
  Books: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Bottles: 'bg-teal-50 text-teal-700 border-teal-200',
  Keys: 'bg-orange-50 text-orange-700 border-orange-200',
  Others: 'bg-gray-50 text-gray-700 border-gray-200'
};

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

export default function ItemCard({ item, onClick }) {
  const category = item.category || 'Others';
  const icon = CATEGORY_ICONS[category] || '📦';
  const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.Others;
  const isFound = item.status === 'found';

  const imgUrl = item.imageUrl || item.photo;
  const optimizedUrl = imgUrl && imgUrl.startsWith('https://res.cloudinary.com/')
    ? "https://res.cloudinary.com/v6m777sp/image/fetch/w_500,q_auto,f_auto/" + encodeURIComponent(imgUrl)
    : imgUrl;

  return (
    <div
      onClick={() => onClick && onClick(item)}
      className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col"
    >
      <div className="relative h-48 w-full bg-gray-100 overflow-hidden flex items-center justify-center">
        {imgUrl ? (
          <img
            src={optimizedUrl}
            alt={item.item || item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
            <span className="text-5xl">{icon}</span>
            <span className="text-xs font-semibold text-gray-500 tracking-wider uppercase">{category}</span>
          </div>
        )}

        <div className="absolute top-3 left-3">
          <span className={"px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm " + (isFound ? "bg-secondary text-white" : "bg-primary text-white")}>
            {isFound ? 'Found' : 'Lost'}
          </span>
        </div>

        <div className="absolute top-3 right-3">
          <span className={"px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-md bg-white/90 shadow-sm " + colorClass}>
            {icon} {category}
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3 className="font-bold text-gray-900 text-base leading-snug group-hover:text-primary transition-colors">
            {item.item || item.title}
          </h3>
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">
            {item.description}
          </p>
        </div>

        <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-xs text-gray-500 font-medium">
          <span className="flex items-center gap-1 text-gray-600 truncate max-w-[60%]">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{item.location}</span>
          </span>
          <span className="flex items-center gap-1 text-gray-400 shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatRelativeTime(item.createdAt || item.date)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
