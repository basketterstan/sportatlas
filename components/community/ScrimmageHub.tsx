import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc,
  updateDoc, deleteDoc, getDocs, where,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { ScrimmagePost, ScrimmageMessage, UserProfile } from '../../types';
import { toast } from '../../utils/toast';
import { getTranslation } from '../../utils/i18n';

const SCRIMMAGE_LEVELS = ['Recreational', 'Amateur', 'Competitive', 'Semi-Pro', 'Pro'];

const COUNTRIES = [
  'Belgium', 'Netherlands', 'France', 'Germany', 'Spain', 'Italy', 'Portugal',
  'United Kingdom', 'Ireland', 'Luxembourg', 'Switzerland', 'Austria', 'Denmark',
  'Sweden', 'Norway', 'Finland', 'Poland', 'Czech Republic', 'Slovakia', 'Hungary',
  'Romania', 'Bulgaria', 'Croatia', 'Serbia', 'Slovenia', 'Greece', 'Turkey',
  'United States', 'Canada', 'Australia', 'Other',
];
const LEVELS = ['All', ...SCRIMMAGE_LEVELS];
const AGE_GROUPS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U21', 'Adult', 'Mixed'];

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const days = Math.floor(d / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

interface Props {
  user: User | null;
  userProfile?: UserProfile | null;
  onBack: () => void;
  onLoginRequired?: () => void;
}

const ScrimmageHub: React.FC<Props> = ({ user, userProfile, onBack, onLoginRequired }) => {
  const t = getTranslation(userProfile);
  const [posts, setPosts] = useState<ScrimmagePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ScrimmagePost | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [filterLevel, setFilterLevel] = useState('All');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCountry, setFilterCountry] = useState('All');

  // Form state
  const [form, setForm] = useState({
    level: 'Recreational',
    ageGroup: 'U12',
    country: '',
    location: '',
    dates: [''],
    extraInfo: '',
    contactEmail: '',
    contactPhone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Messages
  const [messages, setMessages] = useState<ScrimmageMessage[]>([]);
  const [msgText, setMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'scrimmages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScrimmagePost)));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedPost) return;
    const q = query(
      collection(db, 'scrimmages', selectedPost.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScrimmageMessage)));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return unsub;
  }, [selectedPost?.id]);

  const filtered = posts.filter(p => {
    if (filterLevel !== 'All' && p.level !== filterLevel) return false;
    if (filterCountry !== 'All' && p.country !== filterCountry) return false;
    if (filterLocation && !p.location.toLowerCase().includes(filterLocation.toLowerCase())) return false;
    return true;
  });

  const handleSubmit = async () => {
    const validDates = form.dates.filter(d => d.trim());
    if (!user || !form.country.trim() || !form.location.trim() || validDates.length === 0) {
      toast.error('Fill in country, location and at least one date.');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'scrimmages'), {
        authorId: user.uid,
        authorName: userProfile?.name || user.displayName || 'Coach',
        level: form.level,
        ageGroup: form.ageGroup,
        country: form.country.trim(),
        location: form.location.trim(),
        dates: validDates,
        extraInfo: form.extraInfo.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        createdAt: Date.now(),
        status: 'open',
      });
      setShowForm(false);
      setForm({ level: 'Recreational', ageGroup: 'U12', country: '', location: '', dates: [''], extraInfo: '', contactEmail: '', contactPhone: '' });
      toast.success('Scrimmage posted!');
    } catch {
      toast.error('Failed to post. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (post: ScrimmagePost) => {
    if (post.authorId !== user?.uid) return;
    try {
      const msgs = await getDocs(collection(db, 'scrimmages', post.id, 'messages'));
      await Promise.all(msgs.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'scrimmages', post.id));
      setSelectedPost(null);
      toast.success('Post removed.');
    } catch {
      toast.error('Failed to delete.');
    }
  };

  const handleToggleStatus = async (post: ScrimmagePost) => {
    if (post.authorId !== user?.uid) return;
    await updateDoc(doc(db, 'scrimmages', post.id), {
      status: post.status === 'open' ? 'closed' : 'open',
    });
    setSelectedPost(prev => prev ? { ...prev, status: prev.status === 'open' ? 'closed' : 'open' } : null);
  };

  const handleSendMessage = async () => {
    if (!user || !selectedPost || !msgText.trim()) return;
    setSendingMsg(true);
    try {
      await addDoc(collection(db, 'scrimmages', selectedPost.id, 'messages'), {
        authorId: user.uid,
        authorName: userProfile?.name || user.displayName || 'Coach',
        content: msgText.trim(),
        createdAt: Date.now(),
      });
      setMsgText('');
    } catch {
      toast.error('Failed to send.');
    } finally {
      setSendingMsg(false);
    }
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedPost) {
    return (
      <div className="min-h-screen bg-ha-bg flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-slate-800">
          <button onClick={() => setSelectedPost(null)} className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black uppercase tracking-tight text-sm truncate">{selectedPost.location}</p>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{selectedPost.ageGroup} · {selectedPost.level}</p>
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${selectedPost.status === 'open' ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
            {selectedPost.status}
          </span>
        </div>

        {/* Post info */}
        <div className="px-4 py-5 border-b border-slate-800 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {selectedPost.country && <InfoChip icon="🌍" label="Country" value={selectedPost.country} />}
            <InfoChip icon="📍" label="City" value={selectedPost.location} />
            <InfoChip icon="🏀" label="Level" value={selectedPost.level} />
            <InfoChip icon="👥" label="Age" value={selectedPost.ageGroup} />
          </div>
          {(selectedPost.dates?.length > 0 || selectedPost.date) && (
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2">Preferred Dates</p>
              <div className="flex flex-wrap gap-2">
                {(selectedPost.dates || [selectedPost.date]).map((d, i) => (
                  <span key={i} className="px-3 py-1.5 bg-slate-800 rounded-full text-sm font-bold text-white">📅 {d}</span>
                ))}
              </div>
            </div>
          )}
          {selectedPost.extraInfo && (
            <div className="bg-slate-900 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Extra Info</p>
              <p className="text-slate-300 text-sm leading-relaxed">{selectedPost.extraInfo}</p>
            </div>
          )}
          {/* Contact info */}
          {(selectedPost.contactEmail || selectedPost.contactPhone) && (
            <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
              <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">Contact</p>
              {selectedPost.contactEmail && (
                <a href={`mailto:${selectedPost.contactEmail}`} className="flex items-center gap-2 text-ha-brand text-sm font-semibold hover:underline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  {selectedPost.contactEmail}
                </a>
              )}
              {selectedPost.contactPhone && (
                <a href={`tel:${selectedPost.contactPhone}`} className="flex items-center gap-2 text-ha-brand text-sm font-semibold hover:underline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.55 2 2 0 0 1 3.6 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  {selectedPost.contactPhone}
                </a>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            <span>Posted by {selectedPost.authorName} · {timeAgo(selectedPost.createdAt)}</span>
          </div>
          {/* Owner actions */}
          {user?.uid === selectedPost.authorId && (
            <div className="flex gap-2">
              <button onClick={() => handleToggleStatus(selectedPost)} className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-colors">
                Mark {selectedPost.status === 'open' ? 'Closed' : 'Open'}
              </button>
              <button onClick={() => handleDelete(selectedPost)} className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl border border-red-900 text-red-500 hover:bg-red-900/20 transition-colors">
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Messages</p>
          {messages.length === 0 && (
            <p className="text-slate-700 text-xs text-center py-6">No messages yet. Be the first to reach out!</p>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-2 ${msg.authorId === user?.uid ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                {msg.authorName.charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-[75%] ${msg.authorId === user?.uid ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">{msg.authorName} · {timeAgo(msg.createdAt)}</span>
                <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.authorId === user?.uid ? 'bg-ha-brand text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        {user ? (
          <div className="px-4 pb-6 pt-3 border-t border-slate-800 flex gap-2">
            <input
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Send a message..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-ha-brand"
            />
            <button
              onClick={handleSendMessage}
              disabled={sendingMsg || !msgText.trim()}
              className="px-4 py-3 bg-ha-brand rounded-xl text-white font-black disabled:opacity-40 transition-all active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        ) : (
          <div className="px-4 pb-6 pt-3 border-t border-slate-800">
            <p className="text-slate-500 text-xs text-center">Log in to send messages.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Post form ────────────────────────────────────────────────────────────
  if (showForm) {
    return (
      <div className="min-h-screen bg-ha-bg pb-10">
        <div className="flex items-center gap-3 px-4 pt-6 pb-5 border-b border-slate-800">
          <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 className="text-white font-black uppercase tracking-tight text-lg italic">Post Scrimmage</h2>
        </div>
        <div className="px-4 pt-6 space-y-5">
          <FormField label="Level">
            <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:border-ha-brand">
              {SCRIMMAGE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Age Group">
            <select value={form.ageGroup} onChange={e => setForm(f => ({ ...f, ageGroup: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:border-ha-brand">
              {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </FormField>
          <FormField label="Country">
            <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:border-ha-brand">
              <option value="">Select country...</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="City / Location">
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Antwerp, Sporthal De Kuip"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:border-ha-brand placeholder-slate-600" />
          </FormField>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Preferred Dates</label>
            <div className="space-y-2">
              {form.dates.map((date, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="date"
                    value={date}
                    onChange={e => setForm(f => ({ ...f, dates: f.dates.map((d, j) => j === i ? e.target.value : d) }))}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:border-ha-brand"
                  />
                  {form.dates.length > 1 && (
                    <button
                      onClick={() => setForm(f => ({ ...f, dates: f.dates.filter((_, j) => j !== i) }))}
                      className="px-3 py-2 bg-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              ))}
              {form.dates.length < 5 && (
                <button
                  onClick={() => setForm(f => ({ ...f, dates: [...f.dates, ''] }))}
                  className="w-full py-2.5 border border-dashed border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-slate-500 transition-colors"
                >
                  + Add Date
                </button>
              )}
            </div>
          </div>
          <FormField label="Extra Information (optional)">
            <textarea value={form.extraInfo} onChange={e => setForm(f => ({ ...f, extraInfo: e.target.value }))}
              placeholder="Number of players, gym size, rules, travel distance..."
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:border-ha-brand placeholder-slate-600 resize-none" />
          </FormField>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-4">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Contact Info (optional)</p>
            <FormField label="Email">
              <input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                placeholder="coach@example.com"
                className="w-full bg-ha-bg border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-ha-brand placeholder-slate-600" />
            </FormField>
            <FormField label="Phone">
              <input type="tel" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+32 470 00 00 00"
                className="w-full bg-ha-bg border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-ha-brand placeholder-slate-600" />
            </FormField>
          </div>
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-5 bg-ha-brand text-white font-black uppercase tracking-widest text-sm rounded-2xl disabled:opacity-50 active:scale-95 transition-all shadow-xl">
            {submitting ? 'Posting...' : 'Post Scrimmage'}
          </button>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ha-bg pb-32">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">{t.scrimmageHubTitle}</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t.findPostPracticeGames}</p>
          </div>
        </div>
        <button onClick={() => user ? setShowForm(true) : onLoginRequired?.()}
          className="px-4 py-2.5 bg-ha-brand text-white font-black uppercase tracking-widest text-[10px] rounded-xl active:scale-95 transition-all shadow-lg">
          {t.postButton}
        </button>
      </div>

      {/* Filters */}
      <div className="px-4 space-y-3 pb-4 border-b border-slate-800">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
              placeholder={t.filterByCity}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-white outline-none focus:border-ha-brand placeholder-slate-600" />
          </div>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-ha-brand">
            <option value="All">🌍 All</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {LEVELS.map(l => (
            <button key={l} onClick={() => setFilterLevel(l)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${filterLevel === l ? 'bg-ha-brand text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      <div className="px-4 pt-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 bg-ha-brand rounded-xl animate-pulse" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="text-4xl">🏀</div>
            <p className="text-white font-black uppercase tracking-tight">No scrimmages found</p>
            <p className="text-slate-500 text-sm">Be the first to post one!</p>
            <button onClick={() => user ? setShowForm(true) : onLoginRequired?.()} className="mt-2 px-6 py-3 bg-ha-brand text-white font-black uppercase tracking-widest text-[10px] rounded-xl active:scale-95 transition-all">
              Post Scrimmage
            </button>
          </div>
        )}
        {filtered.map(post => (
          <button key={post.id} onClick={() => setSelectedPost(post)}
            className="w-full text-left bg-slate-900 border border-slate-800 hover:border-ha-brand/50 rounded-2xl p-4 transition-all active:scale-[0.98] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-white font-black uppercase tracking-tight leading-tight truncate">{post.location}{post.country ? `, ${post.country}` : ''}</p>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">{post.authorName} · {timeAgo(post.createdAt)}</p>
              </div>
              <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${post.status === 'open' ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                {post.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tag label={post.level} />
              <Tag label={post.ageGroup} />
              {(post.dates || (post.date ? [post.date] : [])).slice(0, 2).map((d, i) => (
                <Tag key={i} label={d} icon="📅" />
              ))}
              {(post.dates?.length > 2) && <Tag label={`+${post.dates.length - 2} more`} />}
              {(post.contactEmail || post.contactPhone) && <Tag label="Contact info" icon="📞" />}
            </div>
            {post.extraInfo && (
              <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{post.extraInfo}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

const Tag: React.FC<{ label: string; icon?: string }> = ({ label, icon }) => (
  <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 rounded-full text-[10px] font-bold text-slate-400">
    {icon && <span>{icon}</span>}
    {label}
  </span>
);

const InfoChip: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="bg-slate-900 rounded-xl p-3">
    <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest">{label}</p>
    <p className="text-white font-bold text-sm mt-0.5">{icon} {value}</p>
  </div>
);

export default ScrimmageHub;
