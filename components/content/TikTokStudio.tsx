
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Drill, UserProfile, SkillFocus, Level, DiagramBoard, CourtType } from '../../types';
import CoachBoard from '../shared/CoachBoard';

interface TikTokStudioProps {
  drills: Drill[];
  publicDrills: Drill[];
  onDrillCreated?: (drill: Drill) => Promise<void>;
  onBack: () => void;
  externalActiveDrill?: Drill | null;
}

const TikTokStudio: React.FC<TikTokStudioProps> = ({ drills, publicDrills, onDrillCreated, onBack, externalActiveDrill }) => {
  const [activeDrill, setActiveDrill] = useState<Drill | null>(externalActiveDrill || null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'my' | 'global'>('global'); 
  const [carouselIndex, setCarouselIndex] = useState(0); 
  const [isDownloading, setIsDownloading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  
  // Ref for the hidden high-res export container
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (externalActiveDrill) {
      setActiveDrill(externalActiveDrill);
      setCarouselIndex(0);
    }
  }, [externalActiveDrill]);

  // Total slides = 1 (Cover) + N (Boards) + 1 (Brand CTA)
  const totalSlides = useMemo(() => {
    if (!activeDrill) return 1;
    return (activeDrill.boards?.length || 0) + 2;
  }, [activeDrill]);

  const handleDownload = async () => {
    if (!exportRef.current || isDownloading || !activeDrill) return;
    setIsDownloading(true);
    
    await new Promise(r => setTimeout(r, 400));
    
    try {
      // @ts-ignore
      const canvas = await html2canvas(exportRef.current, {
        scale: 1, 
        useCORS: true,
        backgroundColor: '#0E1013',
        width: 1080,
        height: 1920,
        logging: false,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0
      });
      
      const image = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      const suffix = carouselIndex === 0 ? 'COVER' : 
                     carouselIndex === totalSlides - 1 ? 'BRAND' : 
                     `FRAME_${carouselIndex}`;
      link.download = `sportatlas_HD_${suffix}_${Date.now()}.png`;
      link.href = image;
      link.click();
    } catch (e) {
      alert("Capture engine error. Try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredSidebarDrills = useMemo(() => {
    const source = sidebarTab === 'my' ? (drills || []) : (publicDrills || []);
    const search = (sidebarSearch || '').toLowerCase().trim();
    if (!search) return source;
    return source.filter(d => 
      (d?.title || '').toLowerCase().includes(search) || 
      (d?.focus || '').toLowerCase().includes(search)
    );
  }, [sidebarTab, drills, publicDrills, sidebarSearch]);

  const selectDrill = (drill: Drill) => {
    setActiveDrill(drill);
    setCarouselIndex(0);
    setSidebarOpen(false);
    setSidebarSearch('');
  };

  const renderSlideContent = (isExport: boolean) => {
    if (!activeDrill) return null;
    
    // --- SLIDE 0: THE HOOK (COVER) ---
    if (carouselIndex === 0) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-12 py-32 relative">
          <div className="space-y-10 animate-in zoom-in duration-500">
            <div className={`bg-indigo-600/10 border-2 border-indigo-500/30 rounded-[2rem] mx-auto flex items-center justify-center ${isExport ? 'w-32 h-32' : 'w-16 h-16'}`}>
               <svg className="text-indigo-400" width={isExport ? 64 : 32} height={isExport ? 64 : 32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v20M2 12h20M12 12l8-8M12 12l-8 8"/></svg>
            </div>
            <div className="space-y-4">
              <p className={`font-black uppercase text-indigo-500 tracking-[0.6em] ${isExport ? 'text-2xl' : 'text-xs'}`}>TACTICAL INTEL</p>
              <h2 className={`font-black italic uppercase text-white tracking-tighter leading-[0.9] ${isExport ? 'text-[130px]' : 'text-6xl'}`}>
                {activeDrill.title}
              </h2>
            </div>
            <div className={`bg-ha-brand/10 border-2 border-ha-brand/30 rounded-full mx-auto font-black uppercase text-ha-brand tracking-widest ${isExport ? 'px-10 py-4 text-2xl' : 'px-6 py-2 text-[10px]'}`}>
              {activeDrill.focus}
            </div>
          </div>
          <div className="absolute bottom-20 left-0 w-full text-center">
             <h3 className={`font-black italic text-white uppercase tracking-tighter ${isExport ? 'text-6xl' : 'text-3xl'}`}>HOOPS<span className="text-ha-brand">ATLAS</span></h3>
             <p className={`font-black text-slate-800 uppercase tracking-[0.5em] italic ${isExport ? 'text-2xl' : 'text-[8px]'}`}>COMMAND THE COURT</p>
          </div>
        </div>
      );
    }

    // --- LAST SLIDE: BRAND CTA ---
    if (carouselIndex === totalSlides - 1) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-12">
           <div className={`bg-gradient-to-br from-indigo-500 to-indigo-800 rounded-[4rem] flex items-center justify-center border-white/20 shadow-2xl mb-16 transform -skew-x-12 ${isExport ? 'w-80 h-80 border-[16px]' : 'w-48 h-48 border-8'}`}>
              <span className={`text-white font-black italic leading-none ${isExport ? 'text-[180px]' : 'text-[100px]'}`}>HA</span>
           </div>
           <div className="space-y-8">
              <h2 className={`font-black italic uppercase text-white tracking-tighter leading-[0.8] ${isExport ? 'text-[120px]' : 'text-7xl'}`}>
                OWN THE<br/><span className="text-ha-brand">HARDWOOD.</span>
              </h2>
              <div className={`bg-white/10 mx-auto rounded-full ${isExport ? 'h-4 w-32' : 'h-2 w-16'}`}></div>
              <p className={`font-black uppercase text-slate-500 tracking-[0.4em] leading-relaxed ${isExport ? 'text-4xl' : 'text-xl'}`}>
                Elite Tactical OS
              </p>
           </div>
           <div className={`mt-24 space-y-8 w-full ${isExport ? 'mt-48' : 'mt-24'}`}>
              <div className={`bg-white text-slate-950 mx-auto font-black uppercase shadow-xl ${isExport ? 'px-20 py-10 rounded-[3rem] text-3xl tracking-[0.4em]' : 'px-10 py-5 rounded-[1.5rem] text-sm tracking-widest'}`}>
                Join the Fleet
              </div>
              <p className={`text-ha-brand font-black italic tracking-widest ${isExport ? 'text-3xl' : 'text-sm'}`}>WWW.HOOPSATLAS.COM</p>
           </div>
        </div>
      );
    }

    // --- DYNAMIC SLIDES: DIAGRAM + EXPLANATION ---
    const boardIdx = carouselIndex - 1;
    const currentBoard = activeDrill.boards[boardIdx];
    const currentStep = activeDrill.steps[boardIdx] || 'Execute tactical sequence.';

    return (
      <div className="w-full h-full flex flex-col px-10 py-24 justify-between animate-in slide-in-from-right duration-500">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className={`bg-indigo-600 text-white flex items-center justify-center font-black italic shadow-xl ${isExport ? 'w-24 h-24 text-6xl rounded-3xl' : 'w-12 h-12 text-2xl rounded-2xl'}`}>
                {carouselIndex}
              </div>
              <div>
                <p className={`font-black uppercase text-slate-600 tracking-widest ${isExport ? 'text-xl' : 'text-[8px]'}`}>SQUAD MOVEMENT</p>
                <h3 className={`font-black italic uppercase text-white tracking-tighter ${isExport ? 'text-4xl' : 'text-xl'}`}>{currentBoard?.name || 'Tactical Frame'}</h3>
              </div>
           </div>
           <p className={`font-black text-slate-800 uppercase tracking-widest italic ${isExport ? 'text-xl' : 'text-[8px]'}`}>ATLAS BROADCAST</p>
        </div>

        {/* THE DIAGRAM */}
        <div className="flex-1 flex items-center justify-center py-10">
          <div className={`w-full aspect-[4/5] bg-ha-bg border-white/5 rounded-[3rem] overflow-hidden shadow-2xl relative ${isExport ? 'border-[16px]' : 'border-[8px]'}`}>
            <CoachBoard 
              key={`studio-hq-${activeDrill.id}-${boardIdx}-${isExport ? 'export' : 'preview'}`}
              initialPlayers={currentBoard?.players || []}
              initialLines={currentBoard?.lines || []}
              initialCourtType={currentBoard?.courtType || 'half'}
              readOnly
              onSave={() => {}}
              onCancel={() => {}}
            />
          </div>
        </div>

        {/* THE EXPLANATION UNDER DIAGRAM */}
        <div className={`bg-slate-900/40 border border-slate-800 rounded-[2.5rem] ${isExport ? 'p-12 min-h-[300px]' : 'p-6 min-h-[140px]'} shadow-inner flex items-center justify-center text-center`}>
           <p className={`text-white font-bold italic uppercase tracking-tight leading-relaxed max-w-[90%] mx-auto ${isExport ? 'text-4xl' : 'text-sm'}`}>
             "{currentStep}"
           </p>
        </div>

        <div className={`mt-8 flex justify-center items-center gap-4 ${isExport ? 'mt-14' : 'mt-8'}`}>
           <div className={`h-1 flex-1 bg-white/5`}></div>
           <h4 className={`font-black italic text-white uppercase tracking-tighter opacity-30 ${isExport ? 'text-4xl' : 'text-lg'}`}>HOOPSATLAS</h4>
           <div className={`h-1 flex-1 bg-white/5`}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-ha-bg flex items-center justify-center font-sans overflow-hidden select-none">
      
      {/* HIDDEN HIGH-RES BUFFER */}
      <div className="absolute left-[-5000px] top-0 pointer-events-none overflow-hidden">
        <div 
          ref={exportRef}
          className="bg-ha-bg relative flex flex-col items-center"
          style={{ width: '1080px', height: '1920px' }}
        >
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_50%)]"></div>
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.08),transparent_50%)]"></div>
          {renderSlideContent(true)}
        </div>
      </div>

      {/* HEADER HUD */}
      <div className="absolute top-0 left-0 w-full p-6 z-50 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <button onClick={onBack} className="w-12 h-12 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all shadow-xl">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        <div className="flex flex-col items-end gap-3 pointer-events-auto">
          <button 
            onClick={handleDownload}
            disabled={isDownloading || !activeDrill}
            className="bg-ha-brand text-slate-950 px-8 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl flex items-center gap-3 active:scale-95 disabled:opacity-30 transition-all border-b-4 border-cyan-700"
          >
            {isDownloading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            )}
            {isDownloading ? 'ENCODING...' : 'EXPORT PHOTO'}
          </button>
          
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
             <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Slide {carouselIndex + 1} / {totalSlides}</span>
          </div>
        </div>
      </div>

      {/* MOBILE PREVIEW */}
      <div className="relative h-[70vh] md:h-[75vh] flex items-center justify-center px-4 mt-10">
        <div 
          className="relative bg-ha-bg overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 transition-all duration-500 rounded-[2.5rem] md:rounded-[3rem]"
          style={{ 
            aspectRatio: '9/16',
            height: '100%',
            maxHeight: '100%'
          }}
        >
          {!activeDrill ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 space-y-10">
               <div className="w-24 h-24 bg-slate-900 rounded-3xl flex items-center justify-center border-2 border-dashed border-white/10 text-white/20 animate-pulse">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20M12 2v20M4.93 4.93 14.14 14.14M4.93 19.07 14.14-14.14"/></svg>
               </div>
               <div className="space-y-4">
                  <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">Studio Empty</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 leading-relaxed italic">Select a tactical unit to begin HD synthesis</p>
               </div>
               <button onClick={() => setSidebarOpen(true)} className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">LINK SQUAD ARCHIVE</button>
            </div>
          ) : renderSlideContent(false)}
        </div>

        {activeDrill && (
          <>
            <button 
              disabled={carouselIndex === 0}
              onClick={() => setCarouselIndex(p => p - 1)}
              className="absolute left-[-20px] top-1/2 -translate-y-1/2 w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white/40 disabled:opacity-0 transition-all active:scale-75 z-20"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button 
              disabled={carouselIndex === totalSlides - 1}
              onClick={() => setCarouselIndex(p => p + 1)}
              className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white/40 disabled:opacity-0 transition-all active:scale-75 z-20"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </>
        )}
      </div>

      {/* FOOTER DOTS & LINK BUTTON */}
      <div className="absolute bottom-8 left-0 w-full flex flex-col items-center gap-8 px-8">
        {activeDrill && (
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar max-w-[80vw] px-4">
             {Array.from({ length: totalSlides }).map((_, idx) => (
               <button 
                 key={idx}
                 onClick={() => setCarouselIndex(idx)}
                 className={`transition-all duration-500 rounded-full h-1.5 ${carouselIndex === idx ? 'w-10 bg-ha-brand shadow-[0_0_10px_#22d3ee]' : 'w-1.5 bg-slate-800'}`}
               />
             ))}
          </div>
        )}

        <button 
          onClick={() => setSidebarOpen(true)}
          className="bg-[#0b1224] border border-slate-800 px-10 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.3em] text-white flex items-center gap-4 hover:border-ha-brand/40 transition-all active:scale-95 shadow-2xl"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
          {activeDrill ? 'Switch Tactical Unit' : 'Link Tactical Unit'}
        </button>
      </div>

      {/* TACTICAL ARCHIVE MODAL */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[110] bg-black/98 flex flex-col animate-in slide-in-from-right duration-400">
           {/* STICKY HEADER AREA */}
           <div className="p-8 pt-20 bg-black/50 backdrop-blur-md border-b border-white/5">
              <div className="flex justify-between items-center mb-8 px-2">
                <div className="space-y-1">
                  <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter">Tactical <span className="text-indigo-400">Archive</span></h3>
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Select logic for social synthesis</p>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-4 bg-white/10 rounded-2xl text-white active:scale-90 transition-all shadow-xl">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* STICKY SEARCH */}
              <div className="relative mb-6 px-2">
                <input 
                  type="text" 
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="SEARCH UNITS..."
                  className="w-full bg-[#0b1224] border border-slate-800 rounded-2xl py-5 pl-12 pr-6 text-[10px] font-black uppercase tracking-[0.2em] text-white outline-none focus:border-indigo-500 shadow-inner"
                />
                <svg className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>

              {/* STICKY TABS */}
              <div className="flex bg-[#0b1224] p-1.5 rounded-2xl border border-slate-800 shadow-2xl mx-2">
                  <button onClick={() => setSidebarTab('global')} className={`flex-1 py-4 text-[10px] font-black uppercase rounded-xl transition-all ${sidebarTab === 'global' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-600'}`}>Global Network</button>
                  <button onClick={() => setSidebarTab('my')} className={`flex-1 py-4 text-[10px] font-black uppercase rounded-xl transition-all ${sidebarTab === 'my' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}>My Repertoire</button>
              </div>
           </div>

           {/* SCROLLABLE LIST AREA */}
           <div className="flex-1 overflow-y-auto custom-scrollbar px-10 py-8 space-y-4 pb-40">
              {filteredSidebarDrills.length > 0 ? filteredSidebarDrills.map(drill => (
                <button 
                  key={drill.id} 
                  onClick={() => selectDrill(drill)} 
                  className={`w-full p-8 rounded-[3rem] border text-left transition-all group ${activeDrill?.id === drill.id ? 'bg-slate-900 border-indigo-500 shadow-xl' : 'bg-[#0b1224]/40 border-white/5 hover:border-white/10'}`}
                >
                   <div className="flex justify-between items-start mb-3">
                     <span className="text-[7px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 tracking-widest">{drill.focus}</span>
                     <span className="text-[7px] font-black text-slate-800 uppercase italic">{(drill.boards?.length || 0)} FRAMES</span>
                   </div>
                   <h4 className="text-2xl font-black italic uppercase text-white leading-tight group-hover:text-indigo-400 transition-colors">{drill.title}</h4>
                   <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] mt-4 italic">{drill.duration} MIN • {drill.level}</p>
                </button>
              )) : (
                <div className="py-20 text-center opacity-30">
                   <p className="text-[10px] font-black uppercase tracking-[0.5em]">No tactical units match query</p>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default TikTokStudio;
