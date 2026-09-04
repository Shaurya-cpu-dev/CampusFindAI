import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Sparkles, Shield, ArrowRight, PlusCircle, CheckCircle2, Heart } from 'lucide-react';
import ItemCard from '../components/ItemCard.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import DetailModal from '../components/DetailModal.jsx';

const CATEGORIES = ['All', 'Backpack', 'Electronics', 'Cards', 'Books', 'Bottles', 'Keys', 'Others'];
const LOCATIONS = ['All', 'Library', 'Canteen', 'Classroom', 'Ground', 'Washroom', 'Hostel', 'Auditorium', 'Lab', 'Other'];

export default function HomePage({ searchQuery = '', onSearch }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [activeModalItem, setActiveModalItem] = useState(null);

  useEffect(() => {
    async function loadFeed() {
      try {
        setLoading(true);
        const res = await fetch('/api/found');
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setItems(data.data.reverse());
        }
      } catch (err) {
        console.error('Failed to load feed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFeed();
  }, []);

  const filteredItems = items.filter((item) => {
    const title = (item.item || item.title || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const loc = (item.location || '').toLowerCase();
    const cat = item.category || 'Others';
    const query = searchQuery.toLowerCase().trim();

    const matchesQuery = !query || title.includes(query) || desc.includes(query) || loc.includes(query);
    const matchesCategory = selectedCategory === 'All' || cat.toLowerCase() === selectedCategory.toLowerCase();
    const matchesLocation = selectedLocation === 'All' || loc.toLowerCase().includes(selectedLocation.toLowerCase());

    return matchesQuery && matchesCategory && matchesLocation;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-white"
    >
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-rose-50/40 via-white to-white py-16 sm:py-24 text-center px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-xs font-bold text-primary shadow-soft">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Powered Lost & Found for Campus</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-gray-900 tracking-tight leading-[1.1]">
            Lost Today.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-rose-600">
              Found Today.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-gray-600 max-w-2xl mx-auto font-normal leading-relaxed">
            Your campus lost & found network, now supercharged with Gemini AI semantic matching and instant owner notifications.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4 max-w-md mx-auto">
            <Link
              to="/report/lost"
              className="w-full sm:w-1/2 py-4 px-6 bg-primary hover:bg-[#ff4349] text-white font-extrabold rounded-2xl shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all text-sm flex items-center justify-center gap-2"
            >
              <span>I Lost Something</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/report/found"
              className="w-full sm:w-1/2 py-4 px-6 bg-secondary hover:bg-[#00b248] text-white font-extrabold rounded-2xl shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all text-sm flex items-center justify-center gap-2"
            >
              <span>I Found Something</span>
              <PlusCircle className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Feed & Filters Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Campus Feed</h2>
            <p className="text-xs sm:text-sm text-gray-500">Live feed of items reported around campus</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc === 'All' ? '📍 All Locations' : "📍 " + loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={"px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border " + (isSelected ? "bg-gray-900 text-white border-gray-900 shadow-soft" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50")}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Masonry / Grid Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <SkeletonCard key={n} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-gray-50 rounded-3xl p-12 text-center max-w-md mx-auto my-8 border border-dashed border-gray-200 space-y-4">
            <div className="text-5xl">🎒</div>
            <h3 className="text-lg font-bold text-gray-900">No items found</h3>
            <p className="text-xs text-gray-500">
              No items match your active filters or search. Be the first to report! 🎉
            </p>
            <Link
              to="/report/found"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-white font-bold rounded-xl text-xs shadow-soft"
            >
              Report a Found Item
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-4">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} onClick={setActiveModalItem} />
            ))}
          </div>
        )}
      </section>

      {/* Trust & Privacy Section */}
      <section className="bg-gray-50/70 border-t border-gray-100 py-16 px-4 sm:px-6 lg:px-8 mt-16">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">How CampusFind Works</span>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">3 Simple Steps to Recover Items</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-soft text-center space-y-3">
              <div className="w-12 h-12 bg-rose-50 text-primary font-black rounded-2xl flex items-center justify-center mx-auto text-lg">
                1
              </div>
              <h3 className="font-bold text-gray-900">Report in 30 Seconds</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Take a photo directly with your camera or upload from gallery. Fill in location and description.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-soft text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-50 text-secondary font-black rounded-2xl flex items-center justify-center mx-auto text-lg">
                2
              </div>
              <h3 className="font-bold text-gray-900">Gemini AI Matches</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Deep semantic matching compares item characteristics, location proximity, colors, and timestamps.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-soft text-center space-y-3">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 font-black rounded-2xl flex items-center justify-center mx-auto text-lg">
                3
              </div>
              <h3 className="font-bold text-gray-900">Private Reunion</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                High-confidence matches notify verified owners privately. Collect your item quickly on campus!
              </p>
            </div>
          </div>

          {/* Privacy Promise Card */}
          <div className="bg-white border border-emerald-200 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 shadow-soft">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
              <Shield className="w-8 h-8" />
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1">
              <h4 className="font-extrabold text-gray-900 text-lg">Campus Privacy Promise</h4>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                We never display your phone number or email in the public feed. Private lost reports are accessible only to your verified account.
              </p>
            </div>
          </div>
        </div>
      </section>

      <DetailModal item={activeModalItem} onClose={() => setActiveModalItem(null)} />
    </motion.div>
  );
}
