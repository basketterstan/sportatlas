import React from 'react';

interface Props {
  partnerBannerEnabled: boolean;
  globalAlert: string;
  onPartnerClick: () => void;
}

const GlobalBanners: React.FC<Props> = ({ partnerBannerEnabled, globalAlert, onPartnerClick }) => {
  if (!partnerBannerEnabled && !globalAlert) return null;

  return (
    <div className="fixed top-0 left-0 w-full z-[100] flex flex-col">
      {partnerBannerEnabled && (
        <div
          onClick={onPartnerClick}
          className="bg-gradient-to-r from-indigo-600 to-blue-700 py-2 px-4 flex items-center justify-center gap-4 cursor-pointer hover:from-indigo-500 hover:to-blue-600 transition-all border-b border-white/10 group"
        >
          <img
            src="https://firebasestorage.googleapis.com/v0/b/hoopsatlas-e16e4.firebasestorage.app/o/basketvision_no_bg.png?alt=media&token=56ca9d2c-ba65-4cc5-a278-d7420f344804"
            alt="BasketVision"
            className="h-6 object-contain brightness-0 invert group-hover:scale-110 transition-transform"
          />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/90">Official Partner:</span>
            <span className="text-[10px] font-black italic uppercase text-white tracking-tighter">BasketVision Intelligence</span>
          </div>
          <div className="hidden md:flex items-center gap-2 ml-4 bg-white/10 px-3 py-1 rounded-full border border-white/10">
            <span className="text-[8px] font-black uppercase tracking-widest">Explore Platform</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      )}
      {globalAlert && (
        <div className="bg-amber-500 py-2 px-4 flex items-center justify-center gap-3 border-b border-black/10">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-950">{globalAlert}</p>
        </div>
      )}
    </div>
  );
};

export default GlobalBanners;
