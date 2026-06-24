
import React from 'react';
import { getTranslation } from '../../utils/i18n';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  const t = getTranslation(null);
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-12 animate-in fade-in duration-500 pb-32">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] hover:text-white transition-all mb-8"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
        {t.backToHome}
      </button>

      <div className="space-y-4">
        <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tight">Privacy <span className="text-ha-brand">Policy</span></h1>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Last updated: February 17, 2026</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-10">
        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">1. Introduction</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Welcome to SportAtlas. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we handle your data and our commitment to user privacy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">2. Data Tracking & App Tracking Transparency (ATT)</h2>
          <div className="bg-[#0b1224] border border-indigo-500/20 p-6 rounded-3xl space-y-4">
            <p className="text-slate-300 text-sm font-bold uppercase">Our Policy on Tracking:</p>
            <p className="text-slate-400 text-xs leading-relaxed">
              SportAtlas <strong>does not track</strong> your activity across other companies' apps and websites for advertising purposes. We do not sell your personal information to data brokers or third-party advertisers.
            </p>
            <p className="text-slate-400 text-xs leading-relaxed italic">
              While we collect certain identifiers (like your email and name) to provide the app's core functionality (e.g., syncing your playbook across devices), this data is used exclusively within the SportAtlas ecosystem.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">3. Data Collection</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl">
              <h3 className="text-ha-brand text-xs font-black uppercase mb-3">Identity Data</h3>
              <p className="text-slate-500 text-xs">Name, email address, and profile identifiers provided during login (Firebase Auth, Google, or Apple).</p>
            </div>
            <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl">
              <h3 className="text-ha-brand text-xs font-black uppercase mb-3">Tactical Data</h3>
              <p className="text-slate-500 text-xs">Basketball drills, squad rosters, and tactical diagrams you choose to save and sync to your account.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">4. Use of AI (Gemini)</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            SportAtlas utilizes the Google Gemini API for tactical assistance. Prompts sent to the AI are used for drill generation only. We advise against including personally identifiable information in tactical prompts.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">5. Third Parties</h2>
          <ul className="list-disc pl-6 text-slate-400 text-sm space-y-2 font-medium">
            <li><span className="text-white font-bold">Google Firebase:</span> Secure infrastructure for authentication and storage.</li>
            <li><span className="text-white font-bold">Stripe:</span> Secure payment processing. No payment card details are stored on SportAtlas servers.</li>
            <li><span className="text-white font-bold">Sign in with Apple:</span> Secure authentication service that allows users to keep their email private.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">6. Your Rights</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            You have the right to permanently delete your account and all associated data instantly via the Platform Office (Settings). 
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-ha-brand pl-4">7. Contact</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            For questions regarding your privacy, contact our Data Protection lead via the in-app feedback channel.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
