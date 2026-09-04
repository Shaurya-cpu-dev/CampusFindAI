import React from 'react';

export default function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-soft animate-pulse">
      <div className="bg-gray-200 h-48 w-full"></div>
      <div className="p-4 space-y-3">
        <div className="h-5 bg-gray-200 rounded-md w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded-md w-full"></div>
        <div className="h-4 bg-gray-200 rounded-md w-2/3"></div>
        <div className="flex items-center justify-between pt-2">
          <div className="h-6 bg-gray-200 rounded-full w-24"></div>
          <div className="h-6 bg-gray-200 rounded-full w-16"></div>
        </div>
      </div>
    </div>
  );
}
