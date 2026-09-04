import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function DevPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-mono font-bold mb-2">
            <Terminal className="w-3.5 h-3.5" />
            <span>Developer Diagnostics (/dev)</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">API & System Status</h1>
        </div>

        <button
          onClick={checkStatus}
          className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 transition-all flex items-center gap-2 text-xs font-bold"
        >
          <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} />
          <span>Refresh</span>
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-soft space-y-3">
            <h3 className="font-bold text-gray-900 text-sm">Gemini AI Status</h3>
            <div className="text-xs space-y-2 text-gray-600 font-mono">
              <p><strong>Configured:</strong> {status.ai?.configured ? 'Active ✓' : 'Fallback Mode'}</p>
              <p><strong>Embedding:</strong> {status.ai?.embeddingModel || 'None'}</p>
              <p><strong>Reasoning:</strong> {status.ai?.chatModel || 'None'}</p>
              <p><strong>Details:</strong> {status.ai?.details}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-soft space-y-3">
            <h3 className="font-bold text-gray-900 text-sm">Database & Auth</h3>
            <div className="text-xs space-y-2 text-gray-600 font-mono">
              <p><strong>Found Items:</strong> {status.storage?.foundItems}</p>
              <p><strong>Lost Reports:</strong> {status.storage?.lostItems}</p>
              <p><strong>Notifications:</strong> {status.storage?.notifications}</p>
              <p><strong>Firebase Admin:</strong> {status.auth?.firebaseAdminConfigured ? 'Configured ✓' : 'Not Configured'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900 text-gray-200 rounded-2xl p-6 shadow-soft space-y-3 font-mono text-xs overflow-x-auto">
        <h4 className="text-gray-400 font-bold uppercase">Raw /api/status Output</h4>
        <pre>{JSON.stringify(status, null, 2)}</pre>
      </div>
    </motion.div>
  );
}
