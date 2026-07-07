
import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  doc, collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  setDoc, increment,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { CommunityPost, CommunityReply, UserProfile } from '../../types';

const ADMIN_EMAIL = 'contact@sportatlas.com';

const CHANNEL_LABELS: Record<string, string> = {
  general: 'General Chat', drills: 'Drills & Practice', offense: 'Offense & Plays',
  defense: 'Defense', situations: 'Game Situations', pro: 'Pro Coaches',
};
const CHANNEL_COLORS: Record<string, string> = {
  general: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  drills: 'text-ha-brand bg-ha-brandSoft border-ha-brand/20',
  offense: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  defense: 'text-green-400 bg-green-500/10 border-green-500/20',
  situations: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  pro: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
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
  postId: string;
  user: User;
  userProfile?: UserProfile | null;
  onBack: () => void;
}

const CoachHubPost: React.FC<Props> = ({ postId, user, userProfile, onBack }) => {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likedReplies, setLikedReplies] = useState<Set<string>>(new Set());
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const isAdmin = user.email === ADMIN_EMAIL || !!userProfile?.isAdmin;
  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPro = plan === 'pro' || plan.includes('club') || isAdmin || !!(userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'users', user.uid, 'postLikes', postId)),
      getDoc(doc(db, 'users', user.uid, 'savedPosts', postId)),
      getDocs(collection(db, 'users', user.uid, 'replyLikes')),
    ]).then(([likeSnap, saveSnap, replyLikesSnap]) => {
      setIsLiked(likeSnap.exists());
      setIsSaved(saveSnap.exists());
      setLikedReplies(new Set(replyLikesSnap.docs.map(d => d.id)));
    }).catch(() => {});
  }, [user.uid, postId]);

  useEffect(() => {
    return onSnapshot(doc(db, 'communityPosts', postId), snap => {
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() } as CommunityPost);
      setLoading(false);
    }, () => setLoading(false));
  }, [postId]);

  useEffect(() => {
    const q = query(collection(db, 'communityReplies'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, snap => {
      const arr: CommunityReply[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.postId === postId && data.status !== 'removed') arr.push({ id: d.id, ...data } as CommunityReply);
      });
      setReplies(arr);
    }, () => {});
  }, [postId]);

  const handleLikePost = async () => {
    if (!post) return;
    const likeRef = doc(db, 'users', user.uid, 'postLikes', postId);
    const postRef = doc(db, 'communityPosts', postId);
    setIsLiked(p => !p);
    try {
      if (isLiked) { await deleteDoc(likeRef); await updateDoc(postRef, { likesCount: increment(-1) }); }
      else { await setDoc(likeRef, { createdAt: Date.now() }); await updateDoc(postRef, { likesCount: increment(1) }); }
    } catch {}
  };

  const handleSavePost = async () => {
    const saveRef = doc(db, 'users', user.uid, 'savedPosts', postId);
    setIsSaved(p => !p);
    try { if (isSaved) await deleteDoc(saveRef); else await setDoc(saveRef, { createdAt: Date.now() }); } catch {}
  };

  const handleLikeReply = async (replyId: string) => {
    const likeRef = doc(db, 'users', user.uid, 'replyLikes', replyId);
    const replyRef = doc(db, 'communityReplies', replyId);
    const liked = likedReplies.has(replyId);
    setLikedReplies(prev => { const s = new Set(prev); liked ? s.delete(replyId) : s.add(replyId); return s; });
    try {
      if (liked) { await deleteDoc(likeRef); await updateDoc(replyRef, { likesCount: increment(-1) }); }
      else { await setDoc(likeRef, { createdAt: Date.now() }); await updateDoc(replyRef, { likesCount: increment(1) }); }
    } catch {}
  };

  const handleSubmitReply = async () => {
    const text = replyText.trim();
    if (!text) { setReplyError('Write something before posting.'); return; }
    setSubmitting(true); setReplyError('');
    try {
      await addDoc(collection(db, 'communityReplies'), {
        postId, authorId: user.uid,
        authorName: userProfile?.name || user.displayName || 'Coach',
        authorIsPro: isPro, content: text,
        createdAt: Date.now(), likesCount: 0, status: 'active',
      });
      await updateDoc(doc(db, 'communityPosts', postId), { repliesCount: increment(1) });
      setReplyText('');
    } catch { setReplyError('Failed to post reply.'); }
    setSubmitting(false);
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Remove this post?')) return;
    try { await updateDoc(doc(db, 'communityPosts', postId), { status: 'removed' }); onBack(); } catch {}
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!window.confirm('Remove this reply?')) return;
    try {
      await updateDoc(doc(db, 'communityReplies', replyId), { status: 'removed' });
      await updateDoc(doc(db, 'communityPosts', postId), { repliesCount: increment(-1) });
    } catch {}
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-ha-brand border-t-transparent rounded-full animate-spin" /></div>;
  if (!post || post.status === 'removed') return (
    <div className="flex flex-col items-center py-20 space-y-4 text-center">
      <p className="text-ha-textMid text-sm">This post is no longer available.</p>
      <button onClick={onBack} className="text-ha-brand text-[12px] font-semibold hover:text-ha-brandDim transition-colors">Back to Coach Hub</button>
    </div>
  );

  const chBadge = CHANNEL_COLORS[post.channelId] || 'text-ha-textMid bg-ha-surface2 border-ha-line';
  const chLabel = CHANNEL_LABELS[post.channelId] ?? post.channelId;

  return (
    <div className="px-4 max-w-2xl mx-auto space-y-4 pb-4">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-ha-textMid hover:text-ha-textHi transition-colors pt-2 group">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        <span className="text-[12px] font-medium">Coach Hub</span>
      </button>

      {/* Post */}
      <div className={`bg-ha-surface border rounded-ha-xl p-5 space-y-4 ${post.isPinned ? 'border-ha-brand/30' : 'border-ha-line'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${chBadge}`}>{chLabel}</span>
          {post.isPinned && <span className="text-[10px] font-semibold text-ha-brand">Pinned</span>}
          {post.isFeatured && <span className="text-[10px] font-semibold text-ha-warning">Featured</span>}
          <span className="text-[11px] text-ha-textLow ml-auto">{timeAgo(post.createdAt)}</span>
        </div>

        <h2 className="text-base font-bold text-ha-textHi leading-snug">{post.title}</h2>
        <p className="text-[13px] text-ha-textMid leading-relaxed whitespace-pre-wrap">{post.content}</p>

        <div className="flex items-center gap-2 pt-1 border-t border-ha-line">
          <div className="w-7 h-7 bg-ha-brand rounded-full flex items-center justify-center">
            <span className="text-[11px] font-bold text-white">{(post.authorName?.[0] ?? 'C').toUpperCase()}</span>
          </div>
          <span className="text-[12px] text-ha-textMid font-medium">{post.authorName}</span>
          {post.authorIsPro && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-ha-brandSoft text-ha-brand border border-ha-brand/20 rounded-full">Pro</span>}
        </div>

        <div className="flex items-center gap-4">
          <button onClick={handleLikePost} className={`flex items-center gap-2 text-[12px] font-medium transition-colors ${isLiked ? 'text-red-400' : 'text-ha-textLow hover:text-red-400'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            {post.likesCount > 0 ? post.likesCount : ''} {isLiked ? 'Liked' : 'Like'}
          </button>
          <button onClick={handleSavePost} className={`flex items-center gap-2 text-[12px] font-medium transition-colors ${isSaved ? 'text-ha-brand' : 'text-ha-textLow hover:text-ha-brand'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button onClick={() => { setShowReport(true); setReportSent(false); setReportReason(''); }} className="text-[12px] text-ha-textLow hover:text-ha-warning transition-colors ml-auto">
            Report
          </button>
          {isAdmin && (
            <div className="flex items-center gap-3 border-l border-ha-line pl-3">
              <button onClick={async () => { try { await updateDoc(doc(db, 'communityPosts', postId), { isPinned: !post.isPinned }); } catch {} }} className={`text-[10px] font-semibold uppercase transition-colors ${post.isPinned ? 'text-ha-brand' : 'text-ha-textLow hover:text-ha-brand'}`}>{post.isPinned ? 'Unpin' : 'Pin'}</button>
              <button onClick={async () => { try { await updateDoc(doc(db, 'communityPosts', postId), { isFeatured: !post.isFeatured }); } catch {} }} className={`text-[10px] font-semibold uppercase transition-colors ${post.isFeatured ? 'text-ha-warning' : 'text-ha-textLow hover:text-ha-warning'}`}>{post.isFeatured ? 'Unfeature' : 'Feature'}</button>
              <button onClick={handleDeletePost} className="text-[10px] font-semibold uppercase text-ha-textLow hover:text-ha-danger transition-colors">Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow">
          {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}` : 'No replies yet'}
        </p>
        {replies.map(reply => (
          <div key={reply.id} className="bg-ha-surface border border-ha-line rounded-ha-lg p-4 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 flex-shrink-0 bg-ha-surface2 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-[8px] font-bold text-ha-textMid">{(reply.authorName?.[0] ?? 'C').toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-semibold text-ha-textHi">{reply.authorName}</span>
                  {reply.authorIsPro && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-ha-brandSoft text-ha-brand border border-ha-brand/20 rounded-full">Pro</span>}
                  <span className="text-[10px] text-ha-textLow ml-auto">{timeAgo(reply.createdAt)}</span>
                </div>
                <p className="text-[12px] text-ha-textMid leading-relaxed whitespace-pre-wrap">{reply.content}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pl-8">
              <button onClick={() => handleLikeReply(reply.id)} className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${likedReplies.has(reply.id) ? 'text-red-400' : 'text-ha-textLow hover:text-red-400'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill={likedReplies.has(reply.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                {reply.likesCount > 0 ? reply.likesCount : 'Like'}
              </button>
              {(isAdmin || reply.authorId === user.uid) && (
                <button onClick={() => handleDeleteReply(reply.id)} className="text-[10px] font-semibold uppercase text-ha-textLow hover:text-ha-danger transition-colors ml-auto">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reply form */}
      <div className="bg-ha-surface border border-ha-line rounded-ha-xl p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow">Add Reply</p>
        <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
          placeholder="Share your thoughts or answer..." rows={3} maxLength={600}
          className="w-full bg-ha-bg border border-ha-line rounded-ha-md px-4 py-3 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand transition-colors placeholder:text-ha-textLow resize-none" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ha-textLow">{replyText.length}/600</span>
          {replyError && <p className="text-[11px] text-ha-danger font-medium">{replyError}</p>}
          <button onClick={handleSubmitReply} disabled={submitting || !replyText.trim()}
            className="px-5 py-2 bg-ha-brand rounded-ha-md text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-ha-brandDim active:scale-95 transition-all">
            {submitting ? 'Posting...' : 'Reply'}
          </button>
        </div>
      </div>

      {/* Report modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowReport(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-ha-surface border border-ha-line rounded-ha-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ha-textHi">Report Post</h3>
            {reportSent ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-ha-success text-sm font-medium">Report submitted. Thank you.</p>
                <button onClick={() => setShowReport(false)} className="text-[12px] text-ha-brand font-semibold mt-2">Close</button>
              </div>
            ) : (
              <>
                <textarea value={reportReason} onChange={e => setReportReason(e.target.value)}
                  placeholder="Why doesn't this post belong here?" rows={3}
                  className="w-full bg-ha-bg border border-ha-line rounded-ha-md px-4 py-3 text-sm text-ha-textHi focus:outline-none focus:border-ha-warning transition-colors placeholder:text-ha-textLow resize-none" />
                <div className="flex gap-3">
                  <button onClick={() => setShowReport(false)} className="flex-1 py-2.5 border border-ha-line rounded-ha-md text-[12px] font-medium text-ha-textMid hover:border-ha-line2 transition-all">Cancel</button>
                  <button onClick={async () => { if (!reportReason.trim()) return; try { await addDoc(collection(db, 'communityReports'), { postId, reporterId: user.uid, reason: reportReason.trim(), createdAt: Date.now(), status: 'open' }); setReportSent(true); } catch {} }}
                    disabled={!reportReason.trim()} className="flex-1 py-2.5 bg-ha-warning/20 border border-ha-warning/30 rounded-ha-md text-[12px] font-medium text-ha-warning disabled:opacity-40 hover:bg-ha-warning/30 transition-all">
                    Submit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoachHubPost;
