
import React from 'react';
import { Drill } from '../../types';
import CoachBoard from '../shared/CoachBoard';

interface DrillBriefProps {
  drill: Drill;
  onBack: () => void;
}

const DrillBrief: React.FC<DrillBriefProps> = ({ drill, onBack }) => {
  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-500">
      {/* HEADER HUD */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="space-y-1">
            <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">{drill.title}</h2>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{drill.focus} • {drill.duration} MIN</p>
          </div>
        </div>
        <div className="bg-indigo-600/10 border border-indigo-500/20 px-4 py-2 rounded-xl">
          <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">MISSION BRIEF</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* TACTICAL VISUALS */}
          <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl relative group">
            <div className="p-6 border-b border-slate-900 flex justify-between items-center bg-ha-bg/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black italic text-sm shadow-lg">1</div>
                <h3 className="text-sm font-black uppercase text-white tracking-widest">Setup Visual</h3>
              </div>
            </div>
            <div className="relative w-full aspect-[4/3] sm:aspect-video overflow-hidden">
              <CoachBoard 
                initialPlayers={drill.boards[0]?.players || []} 
                initialLines={drill.boards[0]?.lines || []} 
                initialCourtType={drill.boards[0]?.courtType || 'half'} 
                readOnly 
                onSave={() => {}} 
                onCancel={() => {}} 
              />
            </div>
          </div>

          {/* SECONDARY VISUALS IF ANY */}
          {drill.boards.length > 1 && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {drill.boards.slice(1).map((board, idx) => (
                  <div key={board.id} className="bg-[#0b1224] border border-slate-800 rounded-[2rem] overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-slate-900 text-center">
                       <p className="text-[8px] font-black uppercase text-slate-600 tracking-widest">Frame {idx + 2}</p>
                    </div>
                    <div className="aspect-square relative">
                      <CoachBoard 
                        initialPlayers={board.players} 
                        initialLines={board.lines} 
                        initialCourtType={board.courtType} 
                        readOnly 
                        onSave={() => {}} 
                        onCancel={() => {}} 
                      />
                    </div>
                  </div>
                ))}
             </div>
          )}
        </div>

        <div className="space-y-8">
          {/* EXECUTION STEPS */}
          <section className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic border-b border-slate-900 pb-3">Protocol Steps</h3>
            <div className="space-y-6">
              {drill.steps?.map((step, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <span className="text-[10px] font-black text-indigo-500 mt-0.5">{idx + 1}.</span>
                  <p className="text-slate-300 text-xs font-medium leading-relaxed uppercase tracking-tight">{step}</p>
                </div>
              ))}
            </div>
          </section>

          {/* COACHING TIPS */}
          <section className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 space-y-4 shadow-xl">
            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest italic">Coaching Intel</h3>
            <p className="text-slate-400 text-xs font-medium uppercase leading-relaxed tracking-wide opacity-80">
              {drill.tips_long || drill.tips || "Focus on fundamental execution and repetition."}
            </p>
          </section>

          {/* ACTION BUTTONS */}
          <div className="space-y-4">
            <button 
              onClick={onBack}
              className="w-full py-6 bg-slate-900 border border-slate-800 text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] active:scale-95 transition-all"
            >
              Back to Training Hub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrillBrief;
