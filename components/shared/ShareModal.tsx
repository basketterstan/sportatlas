import React, { useState } from 'react';
import { Drill, TrainingSession } from '../../types';
import { toast } from '../../utils/toast';

interface ShareModalProps {
  item: Drill | TrainingSession;
  itemType: 'drill' | 'playbook';
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ item, itemType, onClose }) => {
  const [copied, setCopied] = useState(false);

  const generateShareUrl = () => {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams({
      type: itemType,
      id: item.id,
      title: 'title' in item ? item.title : item.name,
      authorId: item.userId,
    });
    return `${baseUrl}?share=${params.toString()}`;
  };

  const shareUrl = generateShareUrl();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as any).share({
          title: 'title' in item ? item.title : item.name,
          text: `Check out this ${itemType} on SportAtlas!`,
          url: shareUrl,
        });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Share failed:', e);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-ha-bg/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-md space-y-6 shadow-3xl animate-in zoom-in duration-300">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">
            Share {itemType === 'drill' ? 'Drill' : 'Playbook'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
              Share Link
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 bg-ha-bg border border-slate-800 rounded-xl p-4 text-[9px] font-black uppercase text-slate-400 outline-none overflow-hidden text-ellipsis"
              />
              <button
                onClick={handleCopyLink}
                className={`px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
            Share this link with other coaches. They can import it directly into their library.
          </p>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-800">
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleShare}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95"
            >
              Share via App
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
