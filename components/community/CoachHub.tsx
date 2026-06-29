
import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  collection, query, where, orderBy, onSnapshot, limit,
  doc, addDoc, updateDoc, deleteDoc, getDocs,
  setDoc, increment,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { CommunityPost, UserProfile } from '../../types';
import CoachHubPost from './CoachHubPost';
import { getTranslation } from '../../utils/i18n';
import { callAI } from '../../utils/ai';

interface ChannelMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorIsPro: boolean;
  content: string;
  createdAt: number;
}

const AI_PERSONA = `You are Coach Marcus, a basketball coach with 15+ years experience. Write like you're talking to a fellow coach — direct, practical, no fluff. 3-5 sentences max. No emojis. No hashtags.`;

const AI_TOPICS: Record<string, string[]> = {
  general: ['pre-season preparation', 'building team chemistry', 'handling pressure games', 'motivating players after a loss'],
  drills: ['ball-handling under pressure', 'correcting shooting form', 'competitive rebounding drills', 'transition drills for fast breaks'],
  offense: ['motion offense principles', 'pick-and-roll reads', 'quick-hitter plays out of a timeout', 'attacking a zone defense'],
  defense: ['help-side rotations', 'press defense timing', 'defending the pick-and-roll', 'taking away the corner three'],
  situations: ['late-game inbound plays', 'managing a close lead', 'fouling strategy when up three', 'beating a full-court press'],
  pro: ['in-season load management', 'film session strategy', 'building a scouting system', 'developing a coaching philosophy'],
};

const ADMIN_EMAIL = 'contact@hoopsatlas.com';

type FilterTab = 'all' | 'new' | 'popular' | 'pinned';
type ChannelTab = 'posts' | 'chat';

interface ChannelConfig {
  id: string; label: string; description: string; iconBg: string; icon: React.ReactNode; proOnly: boolean;
}

const CHANNELS: ChannelConfig[] = [
  { id: 'general', label: 'General Chat', description: 'Talk about anything basketball.', iconBg: 'bg-blue-600',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, proOnly: false },
  { id: 'drills', label: 'Drills & Practice Ideas', description: 'Share drills and training ideas.', iconBg: 'bg-ha-brand',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/><path d="M19.07 4.93L4.93 19.07"/></svg>, proOnly: false },
  { id: 'offense', label: 'Offense & Plays', description: 'Plays, systems and strategies.', iconBg: 'bg-teal-600',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>, proOnly: false },
  { id: 'defense', label: 'Defense', description: 'Man-to-man, zone, press and more.', iconBg: 'bg-green-700',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, proOnly: false },
  { id: 'situations', label: 'Game Situations', description: 'Late game, time-outs, inbounds...', iconBg: 'bg-purple-700',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, proOnly: false },
  { id: 'pro', label: 'Pro Coaches', description: 'Exclusive for Pro coaches.', iconBg: 'bg-amber-600',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, proOnly: true },
];

const CHANNEL_LABELS: Record<string, string> = {
  general: 'General Chat', drills: 'Drills & Practice', offense: 'Offense & Plays',
  defense: 'Defense', situations: 'Game Situations', pro: 'Pro Coaches',
};
const CHANNEL_BG: Record<string, string> = {
  general: 'bg-blue-600', drills: 'bg-ha-brand', offense: 'bg-teal-600',
  defense: 'bg-green-700', situations: 'bg-purple-700', pro: 'bg-amber-600',
};

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
  user: User;
  userProfile?: UserProfile | null;
  onBack?: () => void;
}

const CoachHub: React.FC<Props> = ({ user, userProfile, onBack }) => {
  const t = getTranslation(userProfile);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelTab, setChannelTab] = useState<ChannelTab>('posts');
  const [chatMessages, setChatMessages] = useState<ChannelMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [createTitle, setCreateTitle] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [createChannel, setCreateChannel] = useState('general');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiSuccess, setAiSuccess] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = user.email === ADMIN_EMAIL || !!userProfile?.isAdmin;
  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPro = plan === 'pro' || plan.includes('club') || isAdmin || !!(userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());
  const authorName = userProfile?.name || user.displayName || 'Coach';

  // Reset tab when switching channels
  useEffect(() => { setChannelTab('posts'); setChatMessages([]); }, [selectedChannel]);

  // Likes & saves
  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'users', user.uid, 'postLikes')),
      getDocs(collection(db, 'users', user.uid, 'savedPosts')),
    ]).then(([likes, saves]) => {
      setLikedPosts(new Set(likes.docs.map(d => d.id)));
      setSavedPosts(new Set(saves.docs.map(d => d.id)));
    }).catch(() => {});
  }, [user.uid]);

  // Posts listener
  useEffect(() => {
    const q = query(collection(db, 'communityPosts'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const arr: CommunityPost[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status !== 'removed') arr.push({ id: d.id, ...data } as CommunityPost);
      });
      setPosts(arr);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  // Chat listener
  useEffect(() => {
    if (!selectedChannel || channelTab !== 'chat') return;
    const q = query(
      collection(db, 'channelMessages'),
      where('channelId', '==', selectedChannel),
      limit(100),
    );
    return onSnapshot(q, snap => {
      const msgs: ChannelMessage[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChannelMessage));
      msgs.sort((a, b) => a.createdAt - b.createdAt);
      setChatMessages(msgs);
    });
  }, [selectedChannel, channelTab]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingChat || !selectedChannel) return;
    setSendingChat(true);
    setChatInput('');
    try {
      await addDoc(collection(db, 'channelMessages'), {
        channelId: selectedChannel,
        authorId: user.uid,
        authorName,
        authorIsPro: isPro,
        content: text,
        createdAt: Date.now(),
        status: 'active',
      });
    } catch (err) { console.error('Chat send error:', err); }
    setSendingChat(false);
  };

  const handleDeleteChat = async (msgId: string) => {
    if (!window.confirm('Delete this message?')) return;
    try { await deleteDoc(doc(db, 'channelMessages', msgId)); } catch (err) { console.error(err); }
  };

  const handleLike = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    const likeRef = doc(db, 'users', user.uid, 'postLikes', postId);
    const postRef = doc(db, 'communityPosts', postId);
    const isLiked = likedPosts.has(postId);
    setLikedPosts(prev => { const s = new Set(prev); isLiked ? s.delete(postId) : s.add(postId); return s; });
    try {
      if (isLiked) { await deleteDoc(likeRef); await updateDoc(postRef, { likesCount: increment(-1) }); }
      else { await setDoc(likeRef, { createdAt: Date.now() }); await updateDoc(postRef, { likesCount: increment(1) }); }
    } catch {}
  };

  const handleSave = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    const saveRef = doc(db, 'users', user.uid, 'savedPosts', postId);
    const isSaved = savedPosts.has(postId);
    setSavedPosts(prev => { const s = new Set(prev); isSaved ? s.delete(postId) : s.add(postId); return s; });
    try { if (isSaved) await deleteDoc(saveRef); else await setDoc(saveRef, { createdAt: Date.now() }); } catch {}
  };

  const handleDeletePost = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!window.confirm('Remove this post?')) return;
    try { await updateDoc(doc(db, 'communityPosts', postId), { status: 'removed' }); } catch (err) { console.error(err); }
  };

  const handlePin = async (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    try { await updateDoc(doc(db, 'communityPosts', post.id), { isPinned: !post.isPinned }); } catch {}
  };

  const handleFeature = async (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    try { await updateDoc(doc(db, 'communityPosts', post.id), { isFeatured: !post.isFeatured }); } catch {}
  };

  const handleCreatePost = async () => {
    const title = createTitle.trim();
    const content = createContent.trim();
    if (!title) { setCreateError('Add a title for your post.'); return; }
    if (!content) { setCreateError('Write something in your post.'); return; }
    const ch = CHANNELS.find(c => c.id === createChannel);
    if (ch?.proOnly && !isPro) { setCreateError('Pro Coaches channel requires a Pro account.'); return; }
    setCreating(true); setCreateError('');
    try {
      await addDoc(collection(db, 'communityPosts'), {
        channelId: createChannel,
        authorId: user.uid,
        authorName,
        authorIsPro: isPro,
        title, content,
        createdAt: Date.now(), updatedAt: Date.now(),
        likesCount: 0, repliesCount: 0,
        isPinned: false, isFeatured: false, status: 'active',
      });
      setCreateTitle(''); setCreateContent(''); setCreateChannel('general'); setShowCreate(false);
    } catch (err) {
      console.error('Post creation error:', err);
      const msg = (err as any)?.code === 'permission-denied'
        ? 'Permission denied — check your Firestore rules for communityPosts.'
        : 'Failed to post. Please try again.';
      setCreateError(msg);
    }
    setCreating(false);
  };

  const handleGenerateAIPost = async () => {
    setGeneratingAI(true); setAiSuccess('');
    const nonPro = CHANNELS.filter(c => !c.proOnly);
    const channel = nonPro[Math.floor(Math.random() * nonPro.length)];
    const topics = AI_TOPICS[channel.id] ?? ['basketball coaching tips'];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    try {
      const raw = await callAI({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_PERSONA },
          { role: 'user', content: `Write a post for the "${channel.label}" channel about: ${topic}.\nReturn JSON only: {"title":"...","content":"..."}` },
        ],
        temperature: 0.85,
        max_tokens: 300,
      });
      const { title, content } = JSON.parse(raw.trim());
      await addDoc(collection(db, 'communityPosts'), {
        channelId: channel.id,
        authorId: user.uid,
        authorName: 'Coach Marcus',
        authorIsPro: true,
        title, content,
        createdAt: Date.now(), updatedAt: Date.now(),
        likesCount: 0, repliesCount: 0,
        isPinned: false, isFeatured: false, status: 'active',
      });
      setAiSuccess(`Posted in ${channel.label}`);
      setTimeout(() => setAiSuccess(''), 3000);
    } catch (err) {
      console.error('AI generate error:', err);
      alert('Failed to generate AI post. Check console for details.');
    }
    setGeneratingAI(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const postCounts: Record<string, number> = {};
  CHANNELS.forEach(ch => { postCounts[ch.id] = posts.filter(p => p.channelId === ch.id).length; });
  const featured = posts.find(p => p.isFeatured);

  const channelPosts = (() => {
    if (!selectedChannel) return [];
    let arr = posts.filter(p => p.channelId === selectedChannel);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      arr = arr.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q));
    }
    if (activeFilter === 'pinned') return arr.filter(p => p.isPinned);
    if (activeFilter === 'popular') return [...arr].sort((a, b) => b.likesCount - a.likesCount);
    return [...arr.filter(p => p.isPinned), ...arr.filter(p => !p.isPinned)];
  })();

  const searchedPosts = searchQuery.trim() && !selectedChannel
    ? posts.filter(p => {
        const q = searchQuery.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q);
      })
    : null;

  const currentChannel = CHANNELS.find(c => c.id === selectedChannel);

  // ── Post detail ────────────────────────────────────────────────────────────
  if (selectedPostId) {
    return (
      <CoachHubPost
        postId={selectedPostId}
        user={user}
        userProfile={userProfile}
        onBack={() => setSelectedPostId(null)}
      />
    );
  }

  return (
    <div className="px-4 max-w-2xl mx-auto space-y-4 pb-24">

      {/* ── CHANNEL VIEW ── */}
      {selectedChannel ? (
        <div className="space-y-4">
          {/* Channel header */}
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => { setSelectedChannel(null); setSearchQuery(''); setActiveFilter('all'); }}
              className="p-2 text-ha-textMid hover:text-ha-textHi transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <div className={`w-9 h-9 ${currentChannel?.iconBg} rounded-ha-md flex items-center justify-center`}>{currentChannel?.icon}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-ha-textHi">{currentChannel?.label}</h2>
              <p className="text-[11px] text-ha-textLow">{currentChannel?.description}</p>
            </div>
            {channelTab === 'posts' && (
              <button onClick={() => { setCreateChannel(selectedChannel); setShowCreate(true); setCreateError(''); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-ha-brand rounded-ha-md text-[11px] font-semibold text-white hover:bg-ha-brandDim active:scale-95 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Post
              </button>
            )}
          </div>

          {/* Posts / Chat tabs */}
          <div className="flex gap-1 bg-ha-surface2 p-1 rounded-ha-lg">
            <button onClick={() => setChannelTab('posts')}
              className={`flex-1 py-1.5 rounded-ha-md text-[12px] font-semibold transition-all ${channelTab === 'posts' ? 'bg-ha-surface text-ha-textHi shadow-sm' : 'text-ha-textLow hover:text-ha-textMid'}`}>
              Posts
            </button>
            <button onClick={() => setChannelTab('chat')}
              className={`flex-1 py-1.5 rounded-ha-md text-[12px] font-semibold transition-all ${channelTab === 'chat' ? 'bg-ha-surface text-ha-textHi shadow-sm' : 'text-ha-textLow hover:text-ha-textMid'}`}>
              Chat
            </button>
          </div>

          {/* POSTS TAB */}
          {channelTab === 'posts' && (
            <>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ha-textLow" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder={`Search in ${currentChannel?.label}...`}
                  className="w-full bg-ha-surface border border-ha-line rounded-ha-lg pl-10 pr-4 py-2.5 text-sm text-ha-textHi placeholder:text-ha-textLow focus:outline-none focus:border-ha-brand transition-colors" />
              </div>
              <FilterTabs active={activeFilter} onChange={setActiveFilter} />
              {loading ? <Loader /> : channelPosts.length === 0
                ? <EmptyState label={activeFilter === 'pinned' ? 'No pinned posts yet' : 'No posts yet — be the first!'} />
                : <div className="space-y-3">{channelPosts.map(post => (
                    <PostCard key={post.id} post={post} isAdmin={isAdmin}
                      isLiked={likedPosts.has(post.id)} isSaved={savedPosts.has(post.id)}
                      onClick={() => setSelectedPostId(post.id)}
                      onLike={e => handleLike(e, post.id)} onSave={e => handleSave(e, post.id)}
                      onDelete={e => handleDeletePost(e, post.id)}
                      onPin={e => handlePin(e, post)} onFeature={e => handleFeature(e, post)} />
                  ))}</div>
              }
            </>
          )}

          {/* CHAT TAB */}
          {channelTab === 'chat' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 min-h-[40vh] max-h-[60vh] overflow-y-auto pr-1">
                {chatMessages.length === 0
                  ? <EmptyState label="No messages yet — say something!" />
                  : chatMessages.map(msg => {
                      const isMe = msg.authorId === user.uid;
                      return (
                        <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isMe && (
                            <div className="w-7 h-7 rounded-full bg-ha-surface2 border border-ha-line flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-bold text-ha-textMid">{(msg.authorName?.[0] ?? 'C').toUpperCase()}</span>
                            </div>
                          )}
                          <div className={`max-w-[75%] group relative ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                            {!isMe && (
                              <span className="text-[10px] text-ha-textLow px-1 flex items-center gap-1">
                                {msg.authorName}
                                {msg.authorIsPro && <span className="text-[8px] font-bold uppercase px-1 py-0.5 bg-ha-brandSoft text-ha-brand border border-ha-brand/20 rounded-full">Pro</span>}
                              </span>
                            )}
                            <div className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${isMe ? 'bg-ha-brand text-white rounded-br-sm' : 'bg-ha-surface border border-ha-line text-ha-textHi rounded-bl-sm'}`}>
                              {msg.content}
                            </div>
                            <span className="text-[9px] text-ha-textLow px-1">{timeAgo(msg.createdAt)}</span>
                            {isAdmin && (
                              <button onClick={() => handleDeleteChat(msg.id)}
                                className="absolute -top-1 right-0 hidden group-hover:flex items-center gap-0.5 text-[9px] text-ha-danger bg-ha-surface border border-ha-line rounded px-1.5 py-0.5">
                                del
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                }
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="flex items-center gap-2 bg-ha-surface border border-ha-line rounded-ha-xl px-3 py-2">
                <input
                  type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                  placeholder="Message..."
                  className="flex-1 bg-transparent text-sm text-ha-textHi placeholder:text-ha-textLow focus:outline-none"
                />
                <button onClick={handleSendChat} disabled={!chatInput.trim() || sendingChat}
                  className="w-8 h-8 flex items-center justify-center bg-ha-brand rounded-full disabled:opacity-40 active:scale-90 transition-all flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>

      ) : (
        /* ── HUB HOME ── */
        <div className="space-y-4">
          <div className="flex items-center justify-between pt-2">
            <div>
              <h2 className="text-xl font-bold text-ha-textHi">{t.coachHubTitle}</h2>
              <p className="text-[12px] text-ha-textLow mt-0.5">{t.connectShareGrow}</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button onClick={handleGenerateAIPost} disabled={generatingAI}
                  title="Generate AI post as Coach Marcus"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-ha-lg text-[11px] font-semibold border transition-all active:scale-95 ${generatingAI ? 'opacity-60 cursor-not-allowed border-ha-line text-ha-textLow' : 'border-ha-line text-ha-textMid hover:border-ha-brand hover:text-ha-brand'}`}>
                  {generatingAI
                    ? <><SpinIcon />Generating...</>
                    : <><SparkleIcon />{t.aiPost}</>
                  }
                </button>
              )}
              {aiSuccess && <span className="text-[11px] text-ha-success font-medium">{aiSuccess}</span>}
              <button onClick={() => { setShowCreate(true); setCreateError(''); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-ha-brand rounded-ha-lg text-[12px] font-semibold text-white hover:bg-ha-brandDim active:scale-95 shadow-[0_4px_16px_rgba(232,116,60,0.3)] transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {t.newPost}
              </button>
            </div>
          </div>

          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ha-textLow" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.searchCoachHub}
              className="w-full bg-ha-surface border border-ha-line rounded-ha-lg pl-10 pr-4 py-2.5 text-sm text-ha-textHi placeholder:text-ha-textLow focus:outline-none focus:border-ha-brand transition-colors" />
          </div>

          <FilterTabs active={activeFilter} onChange={setActiveFilter} />

          {searchedPosts !== null ? (
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-ha-textLow">{searchedPosts.length} result{searchedPosts.length !== 1 ? 's' : ''} for "{searchQuery}"</p>
              {searchedPosts.length === 0 ? <EmptyState label="No posts match your search" /> :
                searchedPosts.map(post => (
                  <PostCard key={post.id} post={post} isAdmin={isAdmin}
                    isLiked={likedPosts.has(post.id)} isSaved={savedPosts.has(post.id)}
                    onClick={() => setSelectedPostId(post.id)}
                    onLike={e => handleLike(e, post.id)} onSave={e => handleSave(e, post.id)}
                    onDelete={e => handleDeletePost(e, post.id)}
                    onPin={e => handlePin(e, post)} onFeature={e => handleFeature(e, post)} />
                ))
              }
            </div>
          ) : (
            <>
              {/* Channels */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow px-0.5">{t.channelsLabel}</p>
                <div className="bg-ha-surface border border-ha-line rounded-ha-xl overflow-hidden divide-y divide-ha-line">
                  {CHANNELS.map(ch => {
                    const count = postCounts[ch.id] ?? 0;
                    const isLocked = ch.proOnly && !isPro;
                    return (
                      <button key={ch.id} onClick={() => !isLocked && setSelectedChannel(ch.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-ha-surface2 active:bg-ha-surface2'}`}>
                        <div className={`w-10 h-10 ${ch.iconBg} rounded-ha-md flex items-center justify-center flex-shrink-0`}>{ch.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-ha-textHi">{ch.label}</span>
                            {ch.proOnly && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-ha-brandSoft text-ha-brand border border-ha-brand/20 rounded-full">PRO</span>}
                          </div>
                          <p className="text-[11px] text-ha-textLow mt-0.5 truncate">{ch.description}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {count > 0 && <span className="text-sm font-semibold text-ha-textMid">{count}</span>}
                          {isLocked
                            ? <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            : <div className="w-2 h-2 rounded-full bg-ha-brand" />
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Featured post */}
              {featured && activeFilter === 'all' && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow px-0.5">Featured Post</p>
                  <button onClick={() => setSelectedPostId(featured.id)}
                    className="w-full text-left bg-ha-surface border border-ha-line rounded-ha-xl p-4 space-y-3 hover:border-ha-brand/40 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-ha-brand rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-white">{(featured.authorName?.[0] ?? 'C').toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-ha-textHi">{featured.authorName}</span>
                        {featured.authorIsPro && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-ha-brand text-white rounded-full">PRO</span>}
                        <span className="text-[11px] text-ha-textLow">{timeAgo(featured.createdAt)}</span>
                      </div>
                    </div>
                    <p className="text-[13px] font-semibold text-ha-textHi leading-snug group-hover:text-ha-brand transition-colors">{featured.title}</p>
                    <p className="text-[12px] text-ha-textMid leading-relaxed line-clamp-2">{featured.content}</p>
                    <div className="flex items-center gap-4 pt-0.5">
                      <span className="flex items-center gap-1.5 text-[11px] text-ha-textLow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        {featured.likesCount}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ha-textLow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        {featured.repliesCount}
                      </span>
                    </div>
                  </button>
                </div>
              )}

              {/* Filtered post list */}
              {activeFilter !== 'all' && (
                <div className="space-y-3">
                  {(() => {
                    let arr = [...posts];
                    if (activeFilter === 'popular') arr = arr.sort((a, b) => b.likesCount - a.likesCount);
                    if (activeFilter === 'pinned') arr = arr.filter(p => p.isPinned);
                    if (arr.length === 0) return [<EmptyState key="empty" label="No posts here yet" />];
                    return arr.slice(0, 15).map(post => (
                      <PostCard key={post.id} post={post} isAdmin={isAdmin}
                        isLiked={likedPosts.has(post.id)} isSaved={savedPosts.has(post.id)}
                        onClick={() => setSelectedPostId(post.id)}
                        onLike={e => handleLike(e, post.id)} onSave={e => handleSave(e, post.id)}
                        onDelete={e => handleDeletePost(e, post.id)}
                        onPin={e => handlePin(e, post)} onFeature={e => handleFeature(e, post)} />
                    ));
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── CREATE POST OVERLAY ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full bg-ha-surface border-t border-ha-line rounded-t-ha-xl p-5 space-y-4 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-ha-textHi">{t.newPost}</h3>
              <div className="flex items-center gap-2">
                <button onClick={handleCreatePost} disabled={creating}
                  className="px-5 py-2 bg-ha-brand rounded-ha-md text-[12px] font-semibold text-white disabled:opacity-50 hover:bg-ha-brandDim active:scale-95 transition-all">
                  {creating ? 'Posting...' : 'Post'}
                </button>
                <button onClick={() => setShowCreate(false)} className="p-1.5 text-ha-textLow hover:text-ha-textHi transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-ha-textLow">Channel</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {CHANNELS.filter(c => !c.proOnly || isPro).map(ch => (
                  <button key={ch.id} onClick={() => setCreateChannel(ch.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                      createChannel === ch.id ? 'bg-ha-brand text-white border-ha-brand' : 'text-ha-textMid border-ha-line hover:border-ha-textLow'
                    }`}>
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-ha-textLow">Title</label>
              <input type="text" value={createTitle} onChange={e => setCreateTitle(e.target.value)}
                placeholder="What do you want to discuss?" maxLength={120}
                className="w-full bg-ha-bg border border-ha-line rounded-ha-md px-4 py-3 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand transition-colors placeholder:text-ha-textLow" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-ha-textLow">Your post</label>
              <textarea value={createContent} onChange={e => setCreateContent(e.target.value)}
                placeholder="Share your thoughts, question or drill idea..." rows={5} maxLength={1000}
                className="w-full bg-ha-bg border border-ha-line rounded-ha-md px-4 py-3 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand transition-colors placeholder:text-ha-textLow resize-none" />
              <p className="text-right text-[10px] text-ha-textLow">{createContent.length}/1000</p>
            </div>

            {createError && <div className="p-3 bg-ha-danger/10 border border-ha-danger/20 rounded-ha-md text-[12px] text-ha-danger text-center">{createError}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── SUB-COMPONENTS ── */

const FilterTabs: React.FC<{ active: FilterTab; onChange: (f: FilterTab) => void }> = ({ active, onChange }) => {
  const t = getTranslation(null);
  return (
    <div className="flex gap-2">
      {(['all', 'new', 'popular', 'pinned'] as FilterTab[]).map(f => (
        <button key={f} onClick={() => onChange(f)}
          className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${
            active === f ? 'bg-ha-brand text-white shadow-[0_2px_10px_rgba(232,116,60,0.3)]' : 'bg-ha-surface border border-ha-line text-ha-textMid hover:text-ha-textHi'
          }`}>
          {f === 'all' ? t.filterAll : f === 'new' ? t.filterNew : f === 'popular' ? t.filterPopular : t.filterPinned}
        </button>
      ))}
    </div>
  );
};

const Loader = () => (
  <div className="flex justify-center py-16">
    <div className="w-8 h-8 border-2 border-ha-brand border-t-transparent rounded-full animate-spin" />
  </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-14 space-y-2">
    <div className="w-11 h-11 bg-ha-surface2 border border-ha-line rounded-ha-lg flex items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <p className="text-[12px] text-ha-textLow font-medium">{label}</p>
  </div>
);

const SparkleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
  </svg>
);

const SpinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

interface PostCardProps {
  post: CommunityPost; isAdmin: boolean; isLiked: boolean; isSaved: boolean;
  onClick: () => void; onLike: (e: React.MouseEvent) => void; onSave: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void; onPin: (e: React.MouseEvent) => void; onFeature: (e: React.MouseEvent) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, isAdmin, isLiked, isSaved, onClick, onLike, onSave, onDelete, onPin, onFeature }) => (
  <div onClick={onClick}
    className={`bg-ha-surface border rounded-ha-xl p-4 cursor-pointer hover:border-ha-line2 transition-all space-y-2.5 group ${post.isPinned ? 'border-ha-brand/30' : 'border-ha-line'}`}>
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 ${CHANNEL_BG[post.channelId] || 'bg-ha-surface2'} rounded flex items-center justify-center`}>
        <div className="w-1.5 h-1.5 bg-white/70 rounded-full" />
      </div>
      <span className="text-[11px] text-ha-textLow font-medium">{CHANNEL_LABELS[post.channelId] ?? post.channelId}</span>
      {post.isPinned && <span className="text-[10px] font-semibold text-ha-brand">· Pinned</span>}
      <span className="text-[11px] text-ha-textLow ml-auto">{timeAgo(post.createdAt)}</span>
    </div>
    <div>
      <h3 className="text-[13px] font-semibold text-ha-textHi leading-snug group-hover:text-ha-brand transition-colors">{post.title}</h3>
      <p className="text-[12px] text-ha-textMid mt-1 leading-relaxed line-clamp-2">{post.content}</p>
    </div>
    <div className="flex items-center justify-between pt-0.5">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 bg-ha-surface2 rounded-full flex items-center justify-center">
          <span className="text-[8px] font-bold text-ha-textMid">{(post.authorName?.[0] ?? 'C').toUpperCase()}</span>
        </div>
        <span className="text-[11px] text-ha-textMid">{post.authorName}</span>
        {post.authorIsPro && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-ha-brandSoft text-ha-brand border border-ha-brand/20 rounded-full">Pro</span>}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onLike} className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${isLiked ? 'text-red-400' : 'text-ha-textLow hover:text-red-400'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {post.likesCount > 0 ? post.likesCount : ''}
        </button>
        <button onClick={e => { e.stopPropagation(); onClick(); }} className="flex items-center gap-1 text-[11px] text-ha-textLow hover:text-ha-brand transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {post.repliesCount > 0 ? post.repliesCount : ''}
        </button>
        <button onClick={onSave} className={`transition-colors ${isSaved ? 'text-ha-brand' : 'text-ha-textLow hover:text-ha-brand'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-1.5 border-l border-ha-line pl-2">
            <button onClick={onPin} className={`text-[9px] font-semibold uppercase transition-colors ${post.isPinned ? 'text-ha-brand' : 'text-ha-textLow hover:text-ha-brand'}`}>{post.isPinned ? 'Unpin' : 'Pin'}</button>
            <button onClick={onFeature} className={`text-[9px] font-semibold uppercase transition-colors ${post.isFeatured ? 'text-ha-warning' : 'text-ha-textLow hover:text-ha-warning'}`}>{post.isFeatured ? 'Unfeature' : 'Feature'}</button>
            <button onClick={onDelete} className="text-[9px] font-semibold uppercase text-ha-textLow hover:text-ha-danger transition-colors">Delete</button>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default CoachHub;
