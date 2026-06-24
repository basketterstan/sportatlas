import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { Comment } from '../../types';

interface CommentsSectionProps {
  drillId: string;
  userName: string;
  onLogin?: () => void;
}

const CommentsSection: React.FC<CommentsSectionProps> = ({ drillId, userName, onLogin }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [rating, setRating] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "comments"),
      where("drillId", "==", drillId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Comment[] = [];
      // Fix: Cast snap to any to bypass DocumentSnapshot inference issue
      (snap as any).forEach((doc: any) => list.push({ ...doc.data(), id: doc.id } as Comment));
      
      const sortedList = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setComments(sortedList);
    }, (err) => {
      console.error("Comments sync failed:", err.message);
    });

    return () => unsub();
  }, [drillId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !auth.currentUser) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "comments"), {
        drillId,
        userId: auth.currentUser.uid,
        userName: userName || 'Coach',
        text: newComment.trim(),
        rating,
        createdAt: Date.now()
      });
      setNewComment('');
      setRating(5);
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const averageRating = comments.length > 0 
    ? (comments.reduce((acc, c) => acc + (c.rating || 0), 0) / comments.length).toFixed(1)
    : null;

  return (
    <div className="mt-16 space-y-10 border-t border-slate-900 pt-12 px-2">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Coach <span className="text-ha-brand">Intelligence</span></h3>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Community Feedback & Reviews</p>
        </div>
        {averageRating && (
          <div className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 px-5 py-2 rounded-2xl">
            <span className="text-xl font-black italic text-ha-brand">{averageRating}</span>
            <div className="flex text-ha-brand">
              {[1, 2, 3, 4, 5].map((s) => (
                <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill={Number(averageRating) >= s ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ))}
            </div>
            <span className="text-[8px] font-black text-slate-600 uppercase">({comments.length})</span>
          </div>
        )}
      </div>

      {/* Comment Form */}
      {auth.currentUser ? (
        <form onSubmit={handleSubmit} className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Your Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button 
                    key={star} 
                    type="button" 
                    onClick={() => setRating(star)}
                    className={`transition-all ${rating >= star ? 'text-ha-brand scale-110' : 'text-slate-800 hover:text-slate-600'}`}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill={rating >= star ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </button>
                ))}
              </div>
            </div>
            <textarea 
              required
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="SHARE TACTICAL INSIGHTS OR TIPS..."
              className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-[13px] text-white focus:border-ha-brand outline-none transition-all placeholder:text-slate-800 min-h-[100px] resize-none"
            />
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-4 bg-cyan-600 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Uplinking...' : 'Deploy Intel'}
          </button>
        </form>
      ) : (
        <button 
          onClick={onLogin}
          className="w-full p-10 text-center bg-slate-900 border border-dashed border-slate-800 rounded-[2.5rem] hover:bg-slate-900/20 hover:border-ha-brand/30 transition-all group active:scale-[0.99]"
        >
           <p className="text-[10px] font-black text-slate-700 group-hover:text-ha-brand uppercase italic tracking-widest">Login to join the technical discussion</p>
        </button>
      )}

      {/* Comments List */}
      <div className="space-y-6">
        {comments.map((comment) => (
          <div key={comment.id} className="bg-slate-900 border border-slate-900 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-bottom-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-black italic text-ha-brand text-sm shadow-inner">
                  {comment.userName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-black text-white italic uppercase tracking-tight">{comment.userName}</h4>
                  <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex text-ha-brand/50">
                {[1, 2, 3, 4, 5].map((s) => (
                  <svg key={s} width="10" height="10" viewBox="0 0 24 24" fill={comment.rating >= s ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ))}
              </div>
            </div>
            <p className="text-slate-400 text-[13px] leading-relaxed font-medium">
              {comment.text}
            </p>
          </div>
        ))}
        {comments.length === 0 && !isSubmitting && (
           <div className="py-10 text-center text-slate-700 font-black uppercase text-[8px] tracking-[0.3em]">No field reports yet. Be the first to analyze.</div>
        )}
      </div>
    </div>
  );
};

export default CommentsSection;