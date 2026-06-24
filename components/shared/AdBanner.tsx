
import React, { useEffect, useRef } from 'react';

interface AdBannerProps {
  isPaid: boolean;
  adSlot?: string;
  onUpgrade?: () => void;
}

const AdBanner: React.FC<AdBannerProps> = ({ isPaid, adSlot = "auto", onUpgrade }) => {
  const adInited = useRef(false);

  useEffect(() => {
    if (isPaid || adInited.current) return;
    
    try {
      const adsbygoogle = (window as any).adsbygoogle || [];
      adsbygoogle.push({});
      adInited.current = true;
    } catch (e) {
      console.warn("AdSense logic suspended:", e);
    }
  }, [isPaid]);

  if (isPaid) return null;

  return (
    <div className="my-8 space-y-3">
      <div className="flex justify-between items-center px-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-slate-700 rounded-full"></span>
          <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">Advertisement</span>
        </div>
        {onUpgrade && (
          <button 
            onClick={onUpgrade}
            className="text-[8px] font-black text-ha-brand/80 hover:text-ha-brand uppercase tracking-widest transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Remove Ads
          </button>
        )}
      </div>
      
      <div className="relative overflow-hidden bg-[#0b1224]/50 border border-slate-800/50 rounded-[2.5rem] p-4 shadow-2xl flex items-center justify-center min-h-[100px] backdrop-blur-sm">
        <ins className="adsbygoogle"
             style={{ display: 'block', width: '100%', minHeight: '90px' }}
             data-ad-client="ca-pub-3879394539295746"
             data-ad-slot={adSlot === "auto" ? "6265989667" : adSlot}
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      </div>
      <p className="text-center text-[7px] text-slate-800 font-bold uppercase tracking-tighter">Advertisements support the free version of HoopsAtlas</p>
    </div>
  );
};

export default AdBanner;
