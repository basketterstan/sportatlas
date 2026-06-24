import React, { useState } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { getTranslation } from '../../utils/i18n';
import { Sport } from '../../types';
import { SPORTS } from '../../data/sports';

const STORAGE_KEY = 'ha_onboarding_v1';

const logOnboardingSignal = (action: 'completed' | 'drill_clicked') => {
  addDoc(collection(db, 'onboarding_signals'), {
    userId: auth.currentUser?.uid || 'anonymous',
    action,
    timestamp: Date.now(),
  }).catch(() => {});
};

interface OnboardingTutorialProps {
  show: boolean;
  onDone: () => void;
  onCreateDrill: () => void;
}

const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({ show, onDone, onCreateDrill }) => {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [savingSport, setSavingSport] = useState(false);

  const t = getTranslation(null);

  const infoSteps = [
    {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
      ),
      tag: t.drillsTag,
      title: t.drillsTitle,
      body: t.drillsBody,
    },
    {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
      tag: t.trainingTag,
      title: t.trainingTitle,
      body: t.trainingBody,
    },
    {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      tag: t.teamTag,
      title: t.teamTitle,
      body: t.teamBody,
    },
    {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
      tag: t.readyTag,
      title: t.readyTitle,
      body: t.readyBody,
      isLast: true,
    },
  ];

  // Total steps = 1 sport step + infoSteps
  const totalSteps = 1 + infoSteps.length;
  const isSportStep = step === 0;
  const infoStep = isSportStep ? null : infoSteps[step - 1];
  const isLast = !isSportStep && infoStep?.isLast;

  const handleNext = async () => {
    if (isSportStep) {
      if (!selectedSport) return;
      setSavingSport(true);
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await updateDoc(doc(db, 'users', uid), { sport: selectedSport });
        }
      } catch (e) {
        console.error('Failed to save sport:', e);
      } finally {
        setSavingSport(false);
      }
      setStep(1);
      return;
    }
    if (step < totalSteps - 1) {
      setStep(s => s + 1);
    } else {
      handleDone();
    }
  };

  const handleDone = (andCreate = false) => {
    setExiting(true);
    logOnboardingSignal(andCreate ? 'drill_clicked' : 'completed');
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1');
      onDone();
      if (andCreate) onCreateDrill();
    }, 300);
  };

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-sm text-center shadow-2xl relative">

        {/* Skip */}
        {!isSportStep && (
          <button
            onClick={() => handleDone()}
            className="absolute top-6 right-6 text-slate-600 hover:text-slate-400 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            {t.skip}
          </button>
        )}

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 h-2 bg-indigo-500'
                  : i < step
                  ? 'w-2 h-2 bg-indigo-800'
                  : 'w-2 h-2 bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Sport selection step */}
        {isSportStep ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em]">
                Stap 1 van {totalSteps}
              </p>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">
                Kies je sport
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                SportAtlas past alles aan op jouw sport — velden, oefeningen en AI.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SPORTS.map(sport => (
                <button
                  key={sport.id}
                  type="button"
                  onClick={() => setSelectedSport(sport.id)}
                  className={`py-4 px-3 rounded-2xl text-[9px] font-black uppercase tracking-wide transition-all flex flex-col items-center gap-2 border ${
                    selectedSport === sport.id
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg scale-[1.03]'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  <span className="text-3xl">{sport.emoji}</span>
                  <span>{sport.labelNl}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleNext}
              disabled={!selectedSport || savingSport}
              className="w-full py-5 font-black uppercase tracking-[0.2em] rounded-2xl text-xs border-b-4 transition-all shadow-xl bg-indigo-600 hover:bg-indigo-500 border-indigo-800 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingSport ? 'Opslaan...' : 'Volgende →'}
            </button>
          </div>
        ) : (
          <>
            {/* Icon */}
            <div className="w-20 h-20 bg-indigo-600/10 border border-indigo-500/20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl">
              {infoStep!.icon}
            </div>

            {/* Tag */}
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] mb-2">
              {infoStep!.tag}
            </p>

            {/* Title */}
            <h2 className="text-2xl font-black text-white uppercase italic tracking-tight mb-3">
              {infoStep!.title}
            </h2>

            {/* Body */}
            <p className="text-slate-400 text-sm leading-relaxed mb-10">
              {infoStep!.body}
            </p>

            {/* CTA */}
            {isLast ? (
              <div className="space-y-3">
                <button
                  onClick={() => handleDone(true)}
                  className="w-full py-5 font-black uppercase tracking-[0.2em] rounded-2xl text-xs border-b-4 transition-all shadow-xl bg-emerald-600 hover:bg-emerald-500 border-emerald-800 text-white"
                >
                  {t.createFirstDrill}
                </button>
                <button
                  onClick={() => handleDone()}
                  className="w-full py-3 font-black uppercase tracking-[0.2em] rounded-2xl text-xs border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all"
                >
                  {t.close}
                </button>
              </div>
            ) : (
              <button
                onClick={handleNext}
                className="w-full py-5 font-black uppercase tracking-[0.2em] rounded-2xl text-xs border-b-4 transition-all shadow-xl bg-indigo-600 hover:bg-indigo-500 border-indigo-800 text-white"
              >
                {t.next}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export { STORAGE_KEY as ONBOARDING_STORAGE_KEY };
export default OnboardingTutorial;
