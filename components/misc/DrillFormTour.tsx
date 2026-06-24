import React, { useState, useEffect } from 'react';

export const DRILL_TOUR_KEY = 'ha_drill_tour_v1';

interface Step {
  targetId: string;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    targetId: 'drill-tour-ai',
    title: 'Magic Coach AI',
    description: 'Let AI automatically generate a complete drill with court diagrams and coaching steps. Available for Pro members.',
  },
  {
    targetId: 'drill-tour-type',
    title: 'Drill Type',
    description: 'Choose between a Skill Drill (technical exercise) or a Tactical Play (set play or offensive scheme).',
  },
  {
    targetId: 'drill-tour-title',
    title: 'Drill Name',
    description: 'Give your drill a clear name so you can easily find it in your library later.',
  },
  {
    targetId: 'drill-tour-edit-diagram',
    title: 'Edit Diagram',
    description: 'Press "Edit Diagram" to open the court editor. Place players and draw movement arrows. Do this before saving!',
  },
  {
    targetId: 'drill-tour-steps',
    title: 'Execution Protocol',
    description: 'Write out step by step how the drill should be executed. Each step is a coaching instruction for your players.',
  },
  {
    targetId: 'drill-tour-save',
    title: 'Save Your Drill',
    description: 'Once your diagram and steps are ready, hit Save to add the drill to your library. You can also make it public for other coaches.',
  },
];

interface Props {
  show: boolean;
  onDone: () => void;
}

const DrillFormTour: React.FC<Props> = ({ show, onDone }) => {
  const [step, setStep] = useState(0);
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});

  const current = STEPS[step];

  useEffect(() => {
    if (!show) return;
    const el = document.getElementById(current.targetId);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const update = () => {
      const r = el.getBoundingClientRect();
      const pad = 10;
      setHighlightStyle({
        position: 'fixed',
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
        borderRadius: 18,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.75), 0 0 0 3px #06b6d4',
        zIndex: 9998,
        pointerEvents: 'none',
        transition: 'all 0.3s ease',
      });
    };

    const t = setTimeout(update, 300);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show, step, current.targetId]);

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else handleDone();
  };

  const handleDone = () => {
    localStorage.setItem(DRILL_TOUR_KEY, '1');
    onDone();
  };

  if (!show) return null;

  return (
    <>
      <div style={highlightStyle} />

      {/* Fixed tooltip at bottom center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[min(360px,90vw)] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-slate-800 border border-slate-600 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{step + 1} / {STEPS.length}</span>
            <button onClick={handleDone} className="text-slate-500 hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <h4 className="text-sm font-black text-white uppercase italic tracking-tight mb-1">{current.title}</h4>
          <p className="text-slate-400 text-xs leading-relaxed">{current.description}</p>
          <div className="flex gap-2 mt-4">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2.5 bg-slate-700 text-slate-300 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-600 transition-all">
                Back
              </button>
            )}
            <button onClick={handleNext} className="flex-[2] py-2.5 bg-cyan-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-cyan-500 transition-all">
              {step < STEPS.length - 1 ? 'Next' : 'Done'}
            </button>
          </div>
          <div className="flex gap-1 mt-3 justify-center">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-4 bg-cyan-400' : 'w-1 bg-slate-700'}`} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default DrillFormTour;
