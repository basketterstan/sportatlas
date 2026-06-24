
import React, { useState, useMemo, useEffect } from 'react';
import { Lead } from '../../types';
import { cleanObject } from '../../utils/firebase';
import { callAI } from '../../utils/ai';

const LeadManager: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('hoopsatlas_leads_db_v2');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse leads from storage", e);
      return [];
    }
  });

  const [searchRegion, setSearchRegion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundLeads, setFoundLeads] = useState<any[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [aiStatus, setAiStatus] = useState('');

  useEffect(() => {
    // Ensure data is sanitized before stringifying to prevent circular structure errors
    const sanitizedLeads = cleanObject(leads);
    localStorage.setItem('hoopsatlas_leads_db_v2', JSON.stringify(sanitizedLeads));
  }, [leads]);

  const handleAiSearch = async (regionOverride?: string) => {
    const targetRegion = regionOverride || searchRegion;
    if (!targetRegion.trim() || isSearching) return;

    setIsSearching(true);
    setAiStatus(`Uplink: Fetching 50 targets in ${targetRegion.toUpperCase()}...`);
    setFoundLeads([]);

    try {
      const maxRetries = 2;
      let attempt = 0;
      let success = false;
      let data: any = { results: [] };

      while (attempt <= maxRetries && !success) {
        try {
          const randomSeed = Math.floor(Math.random() * 10000);

          const content = await callAI({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'You are a professional researcher. Return ONLY valid JSON with this structure: { "results": [{ "name": string, "email": string, "website": string, "category": "AAU"|"Pro"|"Youth"|"Academy", "location": string }] }'
              },
              {
                role: 'user',
                content: `COMMAND: Find 50 REAL basketball organizations associated with: "${targetRegion}". Be extremely brief in response. Return structured JSON with: name, email, website, category, and location. SEED: ${randomSeed}`
              }
            ],
            response_format: { type: 'json_object' }
          });

          data = JSON.parse(content || '{"results": []}');
          success = true;
        } catch (e: any) {
          console.error(`Prospecting attempt ${attempt + 1} failed:`, e);
          attempt++;
          if (attempt > maxRetries) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      setFoundLeads(data.results || []);
      setAiStatus('');
    } catch (err) {
      console.error("AI Search error:", err);
      alert("Satellite Link Failure. Try a smaller region.");
    } finally {
      setIsSearching(false);
    }
  };

  const saveLead = (lead: any) => {
    if (leads.some(l => l.email === lead.email && lead.email !== 'unknown')) {
      return; 
    }
    const newLead: Lead = {
      id: crypto.randomUUID(),
      name: lead.name,
      email: lead.email || 'unknown',
      category: lead.category === 'Pro' ? 'Academy' : lead.category as any,
      state: lead.location,
      contacted: false
    };
    setLeads(prev => [...prev, newLead]);
    setFoundLeads(prev => prev.filter(l => l.name !== lead.name));
  };

  const saveAllFound = () => {
    const toSave = foundLeads.filter(fl => !leads.some(l => l.email === fl.email && fl.email !== 'unknown'));
    const mapped = toSave.map(lead => ({
      id: crypto.randomUUID(),
      name: lead.name,
      email: lead.email || 'unknown',
      category: lead.category === 'Pro' ? 'Academy' : lead.category as any,
      state: lead.location,
      contacted: false
    }));
    setLeads(prev => [...prev, ...mapped]);
    setFoundLeads([]);
  };

  const freshLeads = useMemo(() => {
    return leads.filter(l => !l.contacted && (filter === 'all' || l.category === filter));
  }, [leads, filter]);

  const contactedLeads = useMemo(() => {
    return leads.filter(l => l.contacted);
  }, [leads]);

  const batches = useMemo(() => {
    const size = 25; 
    const result = [];
    for (let i = 0; i < freshLeads.length; i += size) {
      result.push(freshLeads.slice(i, i + size));
    }
    return result;
  }, [freshLeads]);

  const copyBatch = (batchLeads: Lead[], index: number) => {
    const emails = batchLeads.filter(l => l.email !== 'unknown').map(l => l.email).join(', ');
    if (!emails) {
      alert("No valid emails detected in this batch.");
      return;
    }
    navigator.clipboard.writeText(emails);
    
    const batchIds = batchLeads.map(l => l.id);
    setLeads(prev => prev.map(l => batchIds.includes(l.id) ? { ...l, contacted: true } : l));
    
    setCopyStatus(`Batch ${index + 1} Deployed!`);
    setTimeout(() => setCopyStatus(null), 3000);
  };

  return (
    <div className="space-y-8 pb-20">
      {/* GLOBAL SEARCH CONSOLE */}
      <section className="bg-[#0b1224] border border-indigo-500/30 p-8 rounded-[2.5rem] shadow-2xl space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-3xl rounded-full"></div>
        
        <div className="flex justify-between items-start relative z-10">
          <div className="space-y-1">
            <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter">Fast <span className="text-indigo-400">Prospector</span></h3>
            <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.4em] italic">LITE MODE ACTIVE: ULTRA-FAST UPLINK</p>
          </div>
          {foundLeads.length > 0 && (
            <button onClick={saveAllFound} className="px-6 py-3 bg-emerald-600 text-white font-black uppercase text-[8px] tracking-widest rounded-xl shadow-lg active:scale-95 transition-all">Add All to DB</button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 relative z-10">
           {[
             { label: '🇺🇸 USA', val: 'Basketball organizations in USA' },
             { label: '🇪🇺 Europe', val: 'Professional basketball clubs in Europe' },
             { label: '🇧🇪/🇳🇱 Benelux', val: 'Basketball clubs in Belgium and Netherlands' }
           ].map(reg => (
             <button 
              key={reg.label} 
              onClick={() => handleAiSearch(reg.val)}
              disabled={isSearching}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-[8px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-500 hover:text-white transition-all disabled:opacity-30"
             >
               {reg.label}
             </button>
           ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleAiSearch(); }} className="flex flex-col md:flex-row gap-3 relative z-10">
          <input 
            required
            type="text" 
            value={searchRegion}
            onChange={e => setSearchRegion(e.target.value)}
            placeholder="CUSTOM SECTOR SEARCH..."
            className="flex-1 bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner"
          />
          <button 
            disabled={isSearching}
            className="px-8 py-5 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            )}
            {isSearching ? 'SCANNING...' : 'RUN FAST SCAN'}
          </button>
        </form>

        {isSearching && (
          <div className="py-2 text-center animate-pulse">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.5em]">{aiStatus}</p>
          </div>
        )}

        {foundLeads.length > 0 && (
          <div className="pt-6 border-t border-slate-800 space-y-4 animate-in slide-in-from-top-4">
             <div className="flex justify-between items-center px-2">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Captured Targets ({(foundLeads.length)})</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {foundLeads.map((lead, idx) => (
                  <div key={idx} className="bg-ha-bg/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                     <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <p className="text-[11px] font-black text-white uppercase italic">{lead.name}</p>
                           {lead.email !== 'unknown' && <span className="bg-emerald-500/10 text-emerald-400 text-[5px] font-black px-1 py-0.5 rounded">CONTACT DETECTED</span>}
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[7px] font-bold text-slate-500 uppercase">{lead.location} • {lead.category}</span>
                        </div>
                        {lead.email !== 'unknown' && (
                          <p className="text-[9px] text-indigo-400 font-bold font-mono">{lead.email}</p>
                        )}
                     </div>
                     <button onClick={() => saveLead(lead)} className="p-4 bg-emerald-600/10 text-emerald-500 rounded-xl hover:bg-emerald-600 hover:text-white transition-all active:scale-90">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                     </button>
                  </div>
                ))}
             </div>
          </div>
        )}
      </section>

      {/* DATABASE MANAGEMENT */}
      <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] shadow-xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Inventory <span className="text-indigo-400">Control</span></h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest italic">Central Intelligence Storage</p>
          </div>
          <div className="flex flex-wrap gap-2 bg-ha-bg p-1.5 rounded-2xl border border-slate-900">
             {['all', 'AAU', 'Pro', 'Youth', 'Academy'].map(f => (
               <button 
                key={f}
                onClick={() => { setFilter(f); }}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
               >
                 {f}
               </button>
             ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="bg-ha-bg border border-slate-900 p-6 rounded-3xl space-y-1">
              <p className="text-[7px] font-black uppercase text-slate-600 tracking-widest">Global Units</p>
              <p className="text-2xl font-black italic text-white">{leads.length}</p>
           </div>
           <div className="bg-ha-bg border border-slate-900 p-6 rounded-3xl space-y-1">
              <p className="text-[7px] font-black uppercase text-emerald-500 tracking-widest">To Deploy</p>
              <p className="text-2xl font-black italic text-emerald-400">{freshLeads.length}</p>
           </div>
           <div className="bg-ha-bg border border-slate-900 p-6 rounded-3xl space-y-1">
              <p className="text-[7px] font-black uppercase text-indigo-500 tracking-widest">Archive</p>
              <p className="text-2xl font-black italic text-indigo-400">{contactedLeads.length}</p>
           </div>
           <div className="flex flex-col gap-2">
              <button onClick={() => setShowHistory(!showHistory)} className="flex-1 bg-slate-900 text-slate-400 rounded-2xl text-[8px] font-black uppercase border border-slate-800 hover:text-white transition-all">
                {showHistory ? 'Database' : 'Archive'}
              </button>
              <button onClick={() => { if(window.confirm("Purge DB?")) { setLeads([]); localStorage.removeItem('hoopsatlas_leads_db_v2'); } }} className="flex-1 bg-red-950/20 text-red-500/50 hover:text-red-500 rounded-2xl text-[8px] font-black uppercase border border-red-900/10 transition-all">Purge</button>
           </div>
        </div>

        {!showHistory ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in">
             {batches.length > 0 ? batches.map((batch, idx) => (
               <div key={idx} className="bg-ha-bg border border-slate-800 p-6 rounded-3xl space-y-4 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-600/5 blur-xl"></div>
                  <div className="flex justify-between items-center relative z-10">
                     <div className="space-y-0.5">
                        <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">BATCH {idx + 1}</p>
                        <p className="text-sm font-black text-white italic uppercase">{batch.length} UNITS</p>
                     </div>
                     <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                     </div>
                  </div>
                  <button 
                    onClick={() => copyBatch(batch, idx)}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl transition-all active:scale-95"
                  >
                    {copyStatus?.includes(`Batch ${idx + 1}`) ? 'COPIED TO CLIPBOARD' : `COPY ${batch.filter(l=>l.email !== 'unknown').length} EMAILS`}
                  </button>
               </div>
             )) : (
               <div className="col-span-full py-12 text-center bg-ha-bg/40 rounded-3xl border border-dashed border-slate-800">
                  <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">No leads detected. Start scanning above.</p>
               </div>
             )}
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in">
             <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-2 italic">Operation History</h4>
             <div className="bg-ha-bg border border-slate-900 rounded-3xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                {contactedLeads.length > 0 ? contactedLeads.map(l => (
                   <div key={l.id} className="p-4 border-b border-slate-900 flex items-center justify-between opacity-50 grayscale">
                      <div>
                        <p className="text-[10px] font-black text-white uppercase italic">{l.name}</p>
                        <p className="text-[8px] text-slate-500 font-bold">{l.email}</p>
                      </div>
                      <span className="text-[7px] font-black text-slate-700 uppercase border border-slate-800 px-1.5 py-0.5 rounded">DEPLOYED</span>
                   </div>
                )) : (
                   <p className="p-8 text-center text-[9px] text-slate-700 font-black uppercase">Archive empty.</p>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadManager;
