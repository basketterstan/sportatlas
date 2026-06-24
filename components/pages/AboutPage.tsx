
import React from 'react';

interface AboutPageProps {
  onBack: () => void;
}

const AboutPage: React.FC<AboutPageProps> = ({ onBack }) => {
  const colorClasses = {
    amber: {
      aura: 'bg-amber-500/5',
      icon: 'bg-amber-500/10 border-amber-500/20',
      tag: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      subtitle: 'text-amber-500/80',
      dot: 'bg-amber-500 shadow-[0_0_8px_#f59e0b]',
    },
    blue: {
      aura: 'bg-blue-500/5',
      icon: 'bg-blue-500/10 border-blue-500/20',
      tag: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
      subtitle: 'text-blue-500/80',
      dot: 'bg-blue-500 shadow-[0_0_8px_#3b82f6]',
    },
    cyan: {
      aura: 'bg-ha-brand/5',
      icon: 'bg-ha-brand/10 border-ha-brand/20',
      tag: 'bg-ha-brand/10 border-ha-brand/30 text-ha-brand',
      subtitle: 'text-ha-brand/80',
      dot: 'bg-ha-brand shadow-[0_0_8px_#06b6d4]',
    },
    emerald: {
      aura: 'bg-emerald-500/5',
      icon: 'bg-emerald-500/10 border-emerald-500/20',
      tag: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      subtitle: 'text-emerald-500/80',
      dot: 'bg-emerald-500 shadow-[0_0_8px_#10b981]',
    },
    indigo: {
      aura: 'bg-indigo-500/5',
      icon: 'bg-indigo-500/10 border-indigo-500/20',
      tag: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
      subtitle: 'text-indigo-500/80',
      dot: 'bg-indigo-500 shadow-[0_0_8px_#6366f1]',
    },
    orange: {
      aura: 'bg-orange-500/5',
      icon: 'bg-orange-500/10 border-orange-500/20',
      tag: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
      subtitle: 'text-orange-500/80',
      dot: 'bg-orange-500 shadow-[0_0_8px_#f97316]',
    },
    pink: {
      aura: 'bg-pink-500/5',
      icon: 'bg-pink-500/10 border-pink-500/20',
      tag: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
      subtitle: 'text-pink-500/80',
      dot: 'bg-pink-500 shadow-[0_0_8px_#ec4899]',
    },
    teal: {
      aura: 'bg-teal-500/5',
      icon: 'bg-teal-500/10 border-teal-500/20',
      tag: 'bg-teal-500/10 border-teal-500/30 text-teal-400',
      subtitle: 'text-teal-500/80',
      dot: 'bg-teal-500 shadow-[0_0_8px_#14b8a6]',
    },
    purple: {
      aura: 'bg-purple-500/5',
      icon: 'bg-purple-500/10 border-purple-500/20',
      tag: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
      subtitle: 'text-purple-500/80',
      dot: 'bg-purple-500 shadow-[0_0_8px_#a855f7]',
    },
  };

  type FeatureColor = keyof typeof colorClasses;

  const FeatureCard = ({ icon, title, subtitle, desc, color, tag }: { icon: string, title: string, subtitle: string, desc: string, color: FeatureColor, tag?: string }) => {
    const classes = colorClasses[color];
    return (
    <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl group hover:border-white/10 transition-all relative overflow-hidden flex flex-col h-full">
      <div className={`absolute -right-8 -top-8 w-32 h-32 ${classes.aura} blur-3xl rounded-full group-hover:scale-150 transition-transform duration-700`}></div>
      
      <div className="flex justify-between items-start relative z-10">
        <div className={`w-16 h-16 ${classes.icon} rounded-2xl flex items-center justify-center text-3xl border shadow-inner group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        {tag && (
          <span className={`${classes.tag} border text-[8px] font-black px-2 py-1 rounded uppercase tracking-widest`}>
            {tag}
          </span>
        )}
      </div>

      <div className="space-y-2 relative z-10">
        <p className={`text-[9px] font-black uppercase tracking-[0.3em] ${classes.subtitle}`}>{subtitle}</p>
        <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter leading-none">{title}</h3>
      </div>

      <p className="text-slate-400 text-[11px] leading-relaxed font-medium uppercase tracking-tight opacity-70 flex-1">
        {desc}
      </p>
      
      <div className="pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
         <span className={`text-[7px] font-black uppercase text-slate-700 tracking-widest`}>Module Active</span>
         <div className={`w-1 h-1 rounded-full ${classes.dot}`}></div>
      </div>
    </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-24 animate-in fade-in duration-700 pb-40">
      
      {/* TOP NAVIGATION HUD */}
      <div className="flex items-center justify-between sticky top-6 z-[100] bg-ha-bg p-2 rounded-full border border-white/5">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] bg-slate-900 px-6 py-3 rounded-full border border-slate-800 hover:text-white transition-all active:scale-95 shadow-xl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Return to HQ
        </button>
        <div className="hidden md:flex items-center gap-4 px-6 text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Protocol: Full Access</span>
          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>
        </div>
      </div>

      {/* HERO SECTION */}
      <section className="space-y-8 pt-10 text-center md:text-left">
        <div className="space-y-4">
          <div className="flex items-center justify-center md:justify-start gap-3">
             <div className="h-px w-12 bg-ha-brand"></div>
             <span className="text-[10px] font-black uppercase tracking-[0.5em] text-ha-brand">Tactical Briefing</span>
          </div>
          <h1 className="text-6xl md:text-[120px] font-black italic uppercase tracking-tighter leading-[0.8] drop-shadow-2xl">
            FULL SYSTEM <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-ha-brand via-blue-500 to-indigo-600">OVERVIEW.</span>
          </h1>
        </div>
        <p className="max-w-2xl text-slate-500 text-sm md:text-lg font-medium leading-relaxed uppercase tracking-tight mx-auto md:mx-0">
          HoopsAtlas is not just an app; it is a digital ecosystem for basketball intelligence. From AI-driven tactics to real-time tournament management.
        </p>
      </section>

      {/* ORIGIN STORY SECTION */}
      <section className="space-y-12 animate-in slide-in-from-bottom-8 duration-1000">
        <div className="bg-[#0b1224] border border-ha-brand/20 rounded-[4rem] p-10 md:p-16 shadow-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-ha-brand/5 blur-[120px] rounded-full pointer-events-none"></div>
          <div className="relative z-10 max-w-4xl mx-auto space-y-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-ha-brand/10 rounded-2xl flex items-center justify-center border-2 border-ha-brand/20 text-ha-brand shadow-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M2 12h20M12 12l8-8M12 12l-8 8"/></svg>
              </div>
              <div className="space-y-1">
                <h2 className="text-3xl md:text-4xl font-black italic uppercase text-white tracking-tighter">
                  About <span 
                    className="text-ha-brand cursor-pointer hover:underline decoration-cyan-400/50 underline-offset-4 transition-all"
                    onClick={() => window.location.href = 'https://app.hoopsatlas.com'}
                  >
                    HoopsAtlas
                  </span>
                </h2>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">The origin of our tactical directive</p>
              </div>
            </div>

            <div className="space-y-6 text-slate-300 text-sm md:text-lg font-medium leading-relaxed uppercase tracking-tight italic">
              <p className="border-l-4 border-ha-brand/40 pl-6">
                HoopsAtlas didn’t start as a “business idea” — it started as a solution to a problem I had every week as a coach.
              </p>
              <p className="pl-7">
                I’m Stan, a basketball coach and player. Before each practice, I was constantly doing the same things: searching for drills, redrawing plays, pulling plans together from notes, photos, and different apps. It took time — and it wasn’t organized.
              </p>
              <p className="pl-7">
                So I decided to build the tool I actually wanted to use: one platform where coaches can organize their playbook, drills, and practice plans — always accessible when you need it. That became HoopsAtlas.
              </p>
              <p className="bg-white/5 p-8 rounded-3xl border border-white/5">
                Today, coaches use HoopsAtlas to plan faster, communicate more clearly with their team, and build structure throughout the season — without the chaos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPREHENSIVE FEATURES GRID */}
      <section className="space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard 
            icon="🪄" 
            subtitle="AI Synthesis"
            title="Magic Coach" 
            desc="Describe your tactics in text and let AI instantly generate professional diagrams and step-by-step plans. No more hours of drawing on a clipboard." 
            color="purple"
            tag="PRO"
          />
          <FeatureCard 
            icon="👁️" 
            subtitle="Vision Engine"
            title="Atlas Vision" 
            desc="Upload game footage. Our AI analyzes spacing, shot quality, and defensive rotations to create an in-depth tactical report." 
            color="indigo"
            tag="PRO"
          />
          <FeatureCard 
            icon="🏀" 
            subtitle="Competition"
            title="Tournament Builder" 
            desc="Manage complete tournaments. The engine handles pools, schedules for multiple courts, and tracks live standings and scores." 
            color="amber"
          />
          <FeatureCard 
            icon="🎬" 
            subtitle="Social Content"
            title="Social Studio" 
            desc="Translate tactics into viral success. Export professional graphics and videos of your plays, optimized for TikTok and Instagram Reels." 
            color="pink"
            tag="PRO"
          />
          <FeatureCard 
            icon="📐" 
            subtitle="Movement"
            title="Motion Engine" 
            desc="Convert static diagrams into fluid HD video animations. Players see exactly how the movements and actions flow together." 
            color="cyan"
            tag="PRO"
          />
          <FeatureCard 
            icon="📋" 
            subtitle="Cloud Vault"
            title="Digital Playbook" 
            desc="Your complete tactical archive in the cloud. Create playbooks for specific teams and sync them instantly with all coaches and players." 
            color="blue"
          />
          <FeatureCard 
            icon="🛡️" 
            subtitle="Organization"
            title="Club Headquarters" 
            desc="For clubs: Manage your entire staff. Sponsor coaches for Pro features and share central tactical systems within your entire association." 
            color="emerald"
            tag="CLUB"
          />
          <FeatureCard 
            icon="📅" 
            subtitle="Logistics"
            title="Squad Hub" 
            desc="Manage your team rosters, track attendance for practices, plan events, and communicate via the secure Locker Room chat." 
            color="orange"
          />
          <FeatureCard 
            icon="📍" 
            subtitle="Navigation"
            title="Tactical Grounds" 
            desc="Find every basketball court nearby. Use AI and Maps to discover both public outdoor courts and indoor sports halls in your sector." 
            color="teal"
          />
        </div>
      </section>

      {/* TECH SPECS SECTIE */}
      <section className="bg-slate-900 border border-slate-800 rounded-[4rem] p-12 space-y-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/5 blur-[120px] rounded-full"></div>
        
        <div className="text-center space-y-4">
           <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Hardware & API <span className="text-indigo-400">Integration</span></h2>
           <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">Built on elite infrastructure</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
           <div className="space-y-2">
              <p className="text-xl font-black text-white italic">GEMINI 3.0</p>
              <p className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Core Tactical Reasoning</p>
           </div>
           <div className="space-y-2">
              <p className="text-xl font-black text-white italic">STRIPE</p>
              <p className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Secure License Gateway</p>
           </div>
           <div className="space-y-2">
              <p className="text-xl font-black text-white italic">FIREBASE</p>
              <p className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Military-Grade Storage</p>
           </div>
           <div className="space-y-2">
              <p className="text-xl font-black text-white italic">GOOGLE MAPS</p>
              <p className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Sector Geo-Grounding</p>
           </div>
        </div>
      </section>

      {/* PARTNERS SECTIE */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
           <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Strategic <span className="text-indigo-500">Partners</span></h2>
           <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">Collaborating with industry leaders</p>
        </div>

        <div className="flex flex-wrap justify-center gap-12 items-center">
           <a 
             href="https://www.basketvision.be/en/" 
             target="_blank" 
             rel="noopener noreferrer"
             className="group flex flex-col items-center gap-4 p-8 bg-[#0b1224] border border-slate-800 rounded-[3rem] hover:border-indigo-500/40 transition-all shadow-2xl"
           >
             <img 
               src="https://firebasestorage.googleapis.com/v0/b/hoopsatlas-e16e4.firebasestorage.app/o/basketvision_no_bg.png?alt=media&token=56ca9d2c-ba65-4cc5-a278-d7420f344804" 
               alt="Basketbal Vision" 
               className="h-20 md:h-28 object-contain filter grayscale group-hover:grayscale-0 transition-all"
             />
             <p className="text-[10px] font-black text-slate-500 group-hover:text-indigo-400 uppercase tracking-[0.3em]">Basketbal Vision</p>
           </a>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-700 to-indigo-900 p-16 rounded-[4rem] md:rounded-[5rem] text-center space-y-10 shadow-[0_40px_120px_rgba(79,70,229,0.3)] relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 blur-[100px] rounded-full"></div>
        
        <div className="space-y-4 relative z-10">
          <h3 className="text-5xl md:text-7xl font-black italic uppercase text-white tracking-tighter leading-none">START COMMANDING.</h3>
          <p className="text-blue-100 text-xs md:text-sm font-bold uppercase tracking-widest max-w-lg mx-auto leading-relaxed">
            Stop drawing on paper. Activate your digital headquarters and dominate the competition with data and AI.
          </p>
        </div>

        <button 
          onClick={onBack}
          className="relative z-10 bg-white text-slate-950 px-16 py-7 rounded-[2.5rem] font-black uppercase text-[14px] tracking-[0.3em] shadow-2xl active:scale-95 hover:scale-105 transition-all"
        >
          Initialize Core HQ
        </button>
      </div>

      <div className="flex flex-col items-center gap-4 opacity-20">
        <p className="text-center text-[8px] font-black text-slate-600 uppercase tracking-[0.5em]">HOOPSATLAS PROFESSIONAL • VERSION 1.5.4 • EST. 2026</p>
      </div>
    </div>
  );
};

export default AboutPage;
