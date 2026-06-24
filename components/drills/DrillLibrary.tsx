
import React, { useState, useMemo, useEffect } from 'react';
import { Drill, SkillFocus, Level, SortOption, ViewState, SubscriptionPlan, UserRole, TacticalType, UserProfile } from '../../types';
import AdBanner from '../shared/AdBanner';
import { getTranslation } from '../../utils/i18n';
import { auth } from '../../utils/firebase';

interface DrillLibraryProps {
  isCommunity?: boolean;
  drills: Drill[];
  personalDrillsCount?: number;
  userProfile?: UserProfile | null;
  onSelectDrill: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onVote: (id: string, type: 'like' | 'dislike') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterFocus?: SkillFocus;
  setFilterFocus: (f?: SkillFocus) => void;
  filterLevel?: Level;
  setFilterLevel: (l?: Level) => void;
  showFavoritesOnly: boolean;
  setShowFavoritesOnly: (v: boolean) => void;
  sortBy: SortOption;
  setSortBy: (s: SortOption) => void;
  onSwitchView: (v: ViewState) => void;
  onUpgradeRequest?: (plan: SubscriptionPlan, cycle: 'month' | 'year') => void;
  onAddToPlaybook?: (drillId: string) => void;
  error?: string | null;
}

const DrillLibrary: React.FC<DrillLibraryProps> = ({
  isCommunity = false,
  drills = [],
  personalDrillsCount = 0,
  userProfile,
  onSelectDrill,
  onToggleFavorite,
  onTogglePin,
  searchQuery,
  setSearchQuery,
  filterFocus,
  setFilterFocus,
  filterLevel,
  setFilterLevel,
  showFavoritesOnly,
  setShowFavoritesOnly,
  sortBy,
  setSortBy,
  onSwitchView,
  onUpgradeRequest,
  onAddToPlaybook,
}) => {
  const t = getTranslation(userProfile);
  const [showFilters, setShowFilters] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [activeTacType, setActiveTacType] = useState<TacticalType>('drill');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showClubLibrary, setShowClubLibrary] = useState(false);

  const clubId = userProfile?.managedByUid || (userProfile?.plan?.includes('club') ? userProfile?.uid : null);
  const isInClub = !!clubId && !isCommunity;
  
  const isLoggedIn = !!auth.currentUser;
  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));
  const isPro = plan === 'pro' || plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());
  const isBasic = plan === 'basic';
  const showAds = !isPaid;
  
  // Drill Limits
  const drillLimit = isPro ? Infinity : (isBasic ? 20 : 3);
  const drillLimitReached = personalDrillsCount >= drillLimit;

  const clubDrills = useMemo(() => {
    return drills.filter(d => d.clubId && d.clubId === clubId && (d.type || 'drill') === activeTacType);
  }, [drills, clubId, activeTacType]);

  const processedDrills = useMemo(() => {
    const source = showClubLibrary ? clubDrills : drills;
    let result = source.filter(d => (d.type || 'drill') === activeTacType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(d => 
        (d.title || '').toLowerCase().includes(q) || 
        d.tags?.some(t => (t || '').toLowerCase().includes(q))
      );
    }
    if (filterFocus) result = result.filter(d => d.focus === filterFocus);
    if (filterLevel) result = result.filter(d => d.level === filterLevel);
    if (showFavoritesOnly) result = result.filter(d => d.favorite);

    if (dateFilter !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      if (dateFilter === 'today') result = result.filter(d => (now - (d.createdAt || 0)) < dayMs);
      if (dateFilter === 'week') result = result.filter(d => (now - (d.createdAt || 0)) < dayMs * 7);
      if (dateFilter === 'month') result = result.filter(d => (now - (d.createdAt || 0)) < dayMs * 30);
    }

    return [...result].sort((a, b) => {
      // Pinned items always first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (sortBy === SortOption.AZ) return a.title.localeCompare(b.title);
      if (sortBy === SortOption.OLDEST) return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === SortOption.MOST_LIKES) return (b.likes || 0) - (a.likes || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [drills, activeTacType, searchQuery, filterFocus, filterLevel, showFavoritesOnly, sortBy]);

  const handleDrillClick = (drillId: string, index: number) => {
    if (isCommunity && !isPaid && index >= 3 && isLoggedIn) {
      setShowLockedModal(true);
      return;
    }
    onSelectDrill(drillId);
  };

  const canCreate = isLoggedIn;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <button onClick={() => onSwitchView('home')} className="flex items-center gap-2 text-slate-500 font-black text-[9px] uppercase tracking-[0.2em] hover:text-white transition-all active:scale-95">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"></polyline></svg>
            {t.dashboardBack}
          </button>
          
          {canCreate && (
            <div className="relative group">
              {drillLimitReached && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 bg-red-600 text-white text-[8px] font-black uppercase py-2 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center shadow-xl z-50">
                  Inventory Full ({personalDrillsCount}/{drillLimit}) - Upgrade for more
                </div>
              )}
              <button 
                onClick={() => drillLimitReached ? (onUpgradeRequest ? onUpgradeRequest(isBasic ? 'pro' : 'basic', 'month') : onSwitchView('home')) : onSwitchView('create')} 
                className={`bg-ha-brand text-slate-950 px-8 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-3 ${drillLimitReached ? 'hover:bg-indigo-600 hover:text-white' : 'hover:brightness-110'}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {drillLimitReached ? 'Upgrade for more' : t.newTacticalUnit}
              </button>
            </div>
          )}
        </div>

        {drillLimitReached && (
          <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-[2rem] flex flex-col items-center text-center gap-2 animate-in slide-in-from-top-2">
            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">Inventory Limit Reached ({personalDrillsCount}/{drillLimit} Units)</p>
            <p className="text-slate-400 text-[11px] font-medium leading-relaxed uppercase">
              {isBasic ? 'Basic accounts are limited to 20 units.' : 'Free accounts are limited to 2 units.'} Upgrade for unlimited synthesis.
            </p>
            <button onClick={() => onUpgradeRequest ? onUpgradeRequest(isBasic ? 'pro' : 'basic', 'month') : onSwitchView('home')} className="mt-2 text-ha-brand font-black uppercase text-[10px] underline tracking-widest">Upgrade to {isBasic ? 'Pro' : 'Basic'}</button>
          </div>
        )}

        <div className="space-y-4">
           <div className="relative group">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchTacticalUnits}
                className="w-full bg-[#0b1224] border border-slate-800 rounded-[2rem] py-5 pl-14 pr-6 text-[10px] font-black uppercase tracking-[0.2em] text-white outline-none focus:border-ha-brand shadow-inner transition-all"
              />
              <svg className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
           </div>

           <div className="flex bg-[#0b1224] p-1.5 rounded-[2rem] border border-slate-800 w-full max-sm mx-auto shadow-2xl">
              <button onClick={() => { onSwitchView('library'); setShowClubLibrary(false); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all ${!isCommunity && !showClubLibrary ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>{t.myIntel}</button>
              {isInClub && (
                <button onClick={() => { setShowClubLibrary(v => !v); if (isCommunity) onSwitchView('library'); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all ${showClubLibrary ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                  Club Vault
                </button>
              )}
              <button onClick={() => { onSwitchView('discover'); setShowClubLibrary(false); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all ${isCommunity && !showClubLibrary ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>{t.explore}</button>
           </div>
           
           <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => setActiveTacType('drill')} className={`px-6 py-2.5 rounded-full font-black uppercase text-[8px] tracking-[0.2em] border transition-all ${activeTacType === 'drill' ? 'bg-cyan-600/10 border-ha-brand text-ha-brand' : 'bg-slate-900/50 border-slate-800 text-slate-600'}`}>{t.skillDrills}</button>
              <button onClick={() => setActiveTacType('play')} className={`px-6 py-2.5 rounded-full font-black uppercase text-[8px] tracking-[0.2em] border transition-all ${activeTacType === 'play' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-slate-900/50 border-slate-800 text-slate-600'}`}>{t.tacticalPlays}</button>
              <div className="w-px h-6 bg-slate-800 mx-1 self-center"></div>
              <button onClick={() => setDateFilter('all')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'all' ? 'text-white underline' : 'text-slate-600'}`}>{t.allTime}</button>
              <button onClick={() => setDateFilter('today')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'today' ? 'text-white underline' : 'text-slate-600'}`}>{t.today}</button>
              <button onClick={() => setDateFilter('week')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'week' ? 'text-white underline' : 'text-slate-600'}`}>{t.sevenDays}</button>
              <button onClick={() => setDateFilter('month')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'month' ? 'text-white underline' : 'text-slate-600'}`}>{t.thirtyDays}</button>
           </div>

           <div className="flex flex-wrap justify-center gap-2 pt-2 border-t border-slate-900/30">
              <p className="w-full text-center text-[7px] font-black text-slate-700 uppercase tracking-widest mb-1">{t.sortIntelligence}</p>
              {[SortOption.NEWEST, SortOption.OLDEST, SortOption.AZ, SortOption.MOST_LIKES].map(opt => (
                <button 
                  key={opt} 
                  onClick={() => setSortBy(opt)}
                  className={`px-4 py-1.5 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all border ${sortBy === opt ? 'bg-slate-800 border-slate-700 text-white' : 'bg-transparent border-transparent text-slate-600 hover:text-slate-400'}`}
                >
                  {opt}
                </button>
              ))}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {processedDrills.map((drill, index) => {
          const isLocked = isLoggedIn && isCommunity && !isPaid && index >= 3;
          const isPlay = drill.type === 'play';
          const hasVideo = (drill.videoUploads?.length || 0) > 0 || (drill.videoUrls?.length || 0) > 0;

          return (
            <React.Fragment key={drill.id}>
              {showAds && index > 0 && index % 6 === 0 && (
                <div className="col-span-full">
                  <AdBanner isPaid={isPaid} onUpgrade={() => onUpgradeRequest ? onUpgradeRequest('pro', 'month') : onSwitchView('home')} />
                </div>
              )}
              <div onClick={() => handleDrillClick(drill.id, index)} className={`group relative bg-[#0b1224] border rounded-[2.5rem] flex flex-col transition-all shadow-2xl cursor-pointer ${isLocked ? 'grayscale opacity-80 border-slate-800/40' : isPlay ? 'hover:border-indigo-500/40 border-slate-800/60' : 'hover:border-ha-brand/40 border-slate-800/60'}`}>
                
                {/* VIDEO INDICATOR BADGE */}
                {hasVideo && !isLocked && (
                  <div className="absolute top-6 right-6 z-10 animate-in zoom-in duration-300">
                    <div className="w-8 h-8 bg-indigo-600/90 border border-indigo-400/50 rounded-full flex items-center justify-center text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                )}

                <div className="p-8 flex flex-col gap-8 flex-1">
                  <div className="flex justify-between items-start">
                    <div className="space-y-4 pr-12">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-3 py-1 font-black uppercase rounded-lg border ${isPlay ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-ha-brand/10 text-ha-brand border-ha-brand/20'}`}>{drill.focus}</span>
                        {(drill.likes || 0) > 0 && (
                          <span className="flex items-center gap-1 text-[8px] font-black text-amber-500 uppercase tracking-widest">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                            {drill.likes}
                          </span>
                        )}
                      </div>
                      <h3 className="font-black text-white text-2xl italic uppercase group-hover:text-ha-brand transition-colors">{drill.title}</h3>
                    </div>
                      <div className="absolute top-6 right-6 flex flex-col gap-2 z-20">
                        {onTogglePin && !isCommunity && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); onTogglePin(drill.id); }}
                            className={`p-2 border rounded-lg transition-all ${drill.isPinned ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-amber-400'}`}
                            title={drill.isPinned ? "Unpin" : "Pin to top"}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={drill.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="3"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 10z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                          </button>
                        )}
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const shareData = {
                              title: `HoopsAtlas: ${drill.title}`,
                              text: `Check out this ${drill.type === 'play' ? 'tactical play' : 'basketball drill'} on HoopsAtlas: ${drill.title}`,
                              url: `${window.location.origin}?drillId=${drill.id}`
                            };
                            if (navigator.share && navigator.canShare(shareData)) {
                              try {
                                await navigator.share(shareData);
                              } catch (err) {
                                console.error('Share failed:', err);
                              }
                            } else {
                              try {
                                await navigator.clipboard.writeText(shareData.url);
                                alert("Link copied to clipboard!");
                              } catch (err) {
                                const mailto = `mailto:?subject=Check out this drill on HoopsAtlas&body=Hey! Check out this ${drill.type === 'play' ? 'play' : 'drill'} I found on HoopsAtlas: ${drill.title}. View it here: ${shareData.url}`;
                                window.location.href = mailto;
                              }
                            }
                          }}
                          className="p-2 bg-slate-900/50 border border-slate-800 text-slate-500 rounded-lg hover:text-emerald-400 transition-all"
                          title="Share Tactical Unit"
                        >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                      </button>
                      {onAddToPlaybook && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onAddToPlaybook(drill.id); }}
                          className="p-2 bg-indigo-600 border border-indigo-400 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg"
                          title="Add to Playbook"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-800/40">
                    <span className="text-[10px] font-black uppercase text-slate-600">{drill.duration} Min</span>
                    <span className="text-[8px] font-black uppercase text-ha-brand">{t.execute}</span>
                  </div>
                </div>
                {isLocked && (
                  <div className="absolute inset-0 bg-ha-bg/40 rounded-[2.5rem] flex items-center justify-center">
                    <div className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-2xl">Unlock Pro</div>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {showLockedModal && (
        <div className="fixed inset-0 bg-ha-bg z-[200] flex items-center justify-center p-8">
          <div className="bg-[#0b1224] border border-indigo-500/30 rounded-[3rem] p-10 w-full max-sm text-center space-y-8 animate-in zoom-in shadow-3xl">
            <h3 className="text-3xl font-black italic uppercase text-white">Pro Intel Locked</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Upgrade to unlock the full global database.</p>
            <button onClick={() => { setShowLockedModal(false); if (onUpgradeRequest) onUpgradeRequest('pro', 'month'); else onSwitchView('home'); }} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-2xl active:scale-95 transition-all">Go Pro Now</button>
            <button onClick={() => setShowLockedModal(false)} className="w-full py-4 bg-slate-900 border border-slate-800 rounded-2xl font-black text-slate-500 uppercase active:scale-95 transition-all">Abort</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrillLibrary;
