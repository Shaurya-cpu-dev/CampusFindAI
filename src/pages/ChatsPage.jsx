import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, Shield, MapPin, CheckCircle2, Clock, MessageSquare, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';

const QUICK_PROMPTS = [
  "Hi! Is this item still available?",
  "Where on campus can we meet?",
  "I have safely handed it to the Security Desk.",
  "Can you confirm details/marks on the item?"
];

export default function ChatsPage({ user }) {
  const [searchParams] = useSearchParams();
  const queryItemId = searchParams.get('itemId');
  const queryChatId = searchParams.get('chatId');

  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Load user's conversations list
  async function loadChats() {
    if (!user) return;
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/chats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setChats(data.data);

        // If queryChatId provided, auto select it
        if (queryChatId) {
          const target = data.data.find(c => c.id === queryChatId);
          if (target) setSelectedChat(target);
        } else if (!selectedChat && data.data.length > 0) {
          setSelectedChat(data.data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoading(false);
    }
  }

  // Handle direct item chat initialization from ?itemId=...
  useEffect(() => {
    async function initItemChat() {
      if (!user || !queryItemId) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: queryItemId,
            initialMessage: "Hi! I saw your post regarding this item on CampusFind AI."
          })
        });
        const data = await res.json();
        if (data.success && data.data) {
          setSelectedChat(data.data);
          loadChats();
        }
      } catch (err) {
        console.error('Failed to init item chat:', err);
      }
    }

    if (queryItemId) {
      initItemChat();
    } else {
      loadChats();
    }
  }, [user, queryItemId]);

  // Load full messages when selectedChat changes
  useEffect(() => {
    if (!selectedChat || !user) return;

    async function loadChatDetails() {
      try {
        setChatLoading(true);
        const token = await user.getIdToken();
        const res = await fetch(`/api/chats/${selectedChat.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
          setSelectedChat(data.data);
          setMessages(data.data.messages || []);
        }
      } catch (err) {
        console.error('Error fetching chat messages:', err);
      } finally {
        setChatLoading(false);
      }
    }

    loadChatDetails();
    const interval = setInterval(loadChatDetails, 6000); // Poll conversation every 6s
    return () => clearInterval(interval);
  }, [selectedChat?.id, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSendMessage(textToSend) {
    const text = (textToSend || messageText).trim();
    if (!text || !selectedChat || !user) return;

    try {
      setSending(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/chats/${selectedChat.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages(prev => [...prev, data.data]);
        setMessageText('');
        loadChats();
      } else {
        alert(data.message || 'Failed to send message');
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleResolveHandover() {
    if (!selectedChat || !user) return;
    if (!window.confirm("Mark this handover as resolved and completed?")) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/chats/${selectedChat.id}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedChat(data.data);
        loadChats();
      }
    } catch (err) {
      console.error('Resolve error:', err);
    }
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-primary rounded-3xl flex items-center justify-center mx-auto shadow-soft">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-gray-900">Sign in to Access Chats</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          1-on-1 handover messaging is private and requires a verified campus student account to protect item owners and finders.
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-gray-900 text-white font-extrabold rounded-2xl text-xs shadow-soft hover:bg-black transition-all"
        >
          Return to Home & Login
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-soft flex flex-col md:flex-row h-[750px]">
        {/* Left Column: Conversations List */}
        <div className={"w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col bg-gray-50/50 " + (selectedChat ? "hidden md:flex" : "flex")}>
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
            <h2 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span>Handover Chats</span>
            </h2>
            <button
              onClick={loadChats}
              className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-all"
              title="Refresh"
            >
              <RefreshCw className={"w-3.5 h-3.5 " + (loading ? "animate-spin" : "")} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading && chats.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs">
                Loading conversations...
              </div>
            ) : chats.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs font-bold text-gray-500">No active chats yet.</p>
                <p className="text-[11px] text-gray-400">
                  Click "Coordinate Handover" on any item report to start a secure conversation.
                </p>
              </div>
            ) : (
              chats.map(chatItem => {
                const isSelected = selectedChat?.id === chatItem.id;
                const isResolved = chatItem.status === 'resolved';

                return (
                  <div
                    key={chatItem.id}
                    onClick={() => setSelectedChat(chatItem)}
                    className={"p-4 cursor-pointer transition-all flex items-start gap-3 hover:bg-white " + (isSelected ? "bg-white shadow-soft border-l-4 border-l-primary" : "")}
                  >
                    <div className="w-11 h-11 rounded-2xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center border border-gray-200">
                      {chatItem.itemImage ? (
                        <img src={chatItem.itemImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">📦</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4 className="font-extrabold text-xs text-gray-900 truncate">
                          {chatItem.itemTitle}
                        </h4>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {chatItem.lastMessageAt ? new Date(chatItem.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-500 truncate mb-1">
                        {chatItem.lastMessage ? chatItem.lastMessage.text : 'Conversation started'}
                      </p>

                      <div className="flex items-center gap-1.5">
                        <span className={"px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider " + (
                          chatItem.itemStatus === 'found' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        )}>
                          {chatItem.itemStatus}
                        </span>

                        {isResolved ? (
                          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-[9px] font-bold">
                            Resolved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[9px] font-bold">
                            Active Handover
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Window */}
        <div className={"flex-1 flex flex-col bg-white " + (!selectedChat ? "hidden md:flex" : "flex")}>
          {selectedChat ? (
            <>
              {/* Chat Top Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setSelectedChat(null)}
                    className="md:hidden p-1.5 hover:bg-gray-100 rounded-xl text-gray-600"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <div className="w-10 h-10 rounded-2xl bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                    {selectedChat.itemImage ? (
                      <img src={selectedChat.itemImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-base">📦</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-gray-900 truncate">
                      {selectedChat.itemTitle}
                    </h3>
                    <p className="text-xs text-gray-400 truncate">
                      Chat with {selectedChat.participants?.find(p => p.uid !== user.uid)?.displayName || 'Finder / Owner'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedChat.status === 'resolved' ? (
                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Handover Complete</span>
                    </span>
                  ) : (
                    <button
                      onClick={handleResolveHandover}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Resolved</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Safety Advice Banner */}
              <div className="px-4 py-2 bg-amber-50/70 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-800">
                <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">
                  Campus Safe Handover: Meet in daylight at Campus Security or the Central Library Lobby.
                </span>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3 bg-gray-50/30">
                {messages.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs">
                    No messages yet. Say hello or propose a meetup point!
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderUid === user.uid;

                    return (
                      <div
                        key={msg.id}
                        className={"flex flex-col " + (isMe ? "items-end" : "items-start")}
                      >
                        <span className="text-[10px] text-gray-400 font-bold px-1 mb-0.5">
                          {isMe ? 'You' : msg.senderName}
                        </span>
                        <div
                          className={"max-w-[80%] sm:max-w-md px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm " + (
                            isMe
                              ? "bg-gray-900 text-white rounded-br-none"
                              : "bg-white text-gray-800 border border-gray-200 rounded-bl-none"
                          )}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          <div className={"text-[9px] mt-1 text-right " + (isMe ? "text-gray-300" : "text-gray-400")}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              {selectedChat.status !== 'resolved' && (
                <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto">
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt)}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold rounded-full whitespace-nowrap transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Composer */}
              <div className="p-3 sm:p-4 bg-white border-t border-gray-200">
                {selectedChat.status === 'resolved' ? (
                  <div className="p-3 text-center bg-gray-100 rounded-2xl text-xs text-gray-500 font-bold">
                    This handover has been marked as resolved and completed.
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type a message to coordinate handover..."
                      className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                    />
                    <button
                      type="submit"
                      disabled={sending || !messageText.trim()}
                      className="p-3 bg-primary hover:bg-[#ff4349] disabled:opacity-50 text-white rounded-2xl transition-all shadow-soft shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-gray-400">
              <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center text-gray-300">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="font-extrabold text-base text-gray-700">Select a Conversation</h3>
              <p className="text-xs text-gray-400 max-w-sm">
                Choose an item handover from the left or click "Coordinate Handover" on any lost/found report card.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
