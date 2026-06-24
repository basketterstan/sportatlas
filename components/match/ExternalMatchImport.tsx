import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { Team, CalendarEvent } from '../../types';

interface ExternalMatchImportProps {
  team: Team;
  onClose: () => void;
  onImportComplete: () => void;
}

// Mock data structure for VBL / Wisseq
interface ExternalMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  location: string;
  competition: string;
  matchId: string; // VBL Match ID
}

const ExternalMatchImport: React.FC<ExternalMatchImportProps> = ({ team, onClose, onImportComplete }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [activeMode, setActiveMode] = useState<'url' | 'search' | 'browse'>('url');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundTeams, setFoundTeams] = useState<{ id: string, name: string, club: string, division: string }[]>([]);
  const [competitions, setCompetitions] = useState<{ guid: string, naam: string }[]>([]);
  const [compSearch, setCompSearch] = useState('');
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedExternalTeamId, setSelectedExternalTeamId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ExternalMatch[]>([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setLoading(true);
    setError(null);
    setActiveMode('url');

    try {
      // Extract team ID from URL
      // Example: https://www.basketbal.vlaanderen/ploeg/BVBL1234/heren-a
      // Or: https://vblweb.wisseq.eu/ploeg/BVBL1234
      const match = urlInput.match(/ploeg\/([A-Z0-9]+)/i);
      const teamId = match ? match[1] : urlInput.trim();

      if (!teamId || teamId.length < 4) {
        throw new Error("Invalid URL or Team ID. Please paste a link to a team page.");
      }

      // Fetch team details to verify
      const teamRes = await fetch(`/api/vbl/team/${teamId}`);
      if (!teamRes.ok) throw new Error("Team not found. Check the ID/URL.");
      const teamData = await teamRes.json();

      setFoundTeams([{
        id: teamData.guid,
        name: teamData.naam,
        club: teamData.clubNaam || "VBL Club",
        division: teamData.competitieNaam || "Competitie"
      }]);
      
      // Automatically fetch matches for this team
      await getExternalMatches(teamData.guid);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Function to search teams in "VBL / Wisseq" database
  const searchExternalTeams = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setActiveMode('search');
    
    try {
      // Search for clubs first
      const response = await fetch(`/api/vbl/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Search failed");
      }
      const data = await response.json();
      
      // VBL API returns a list of clubs. We need to fetch teams for each club or let user pick club.
      // For simplicity, let's assume the search returns clubs and we fetch teams for the first few.
      const clubs = data.slice(0, 5);
      const allTeams: any[] = [];
      
      for (const club of clubs) {
        const teamsRes = await fetch(`/api/vbl/club/${club.guid}/teams`);
        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          teamsData.forEach((t: any) => {
            allTeams.push({
              id: t.guid,
              name: t.naam,
              club: club.naam,
              division: t.competitie || t.reeks || "Competitie"
            });
          });
        }
      }

      setFoundTeams(allTeams);
    } catch (err) {
      console.error(err);
      setError("Failed to connect to Basketball Vlaanderen. Please try again.");
    } finally {
      setLoading(false);
      setSelectedExternalTeamId(null);
      setMatches([]);
    }
  };

  // Function to get matches for a specific team
  const getExternalMatches = async (externalTeamId: string) => {
    setLoading(true);
    setSelectedExternalTeamId(externalTeamId);
    setError(null);
    
    try {
      const response = await fetch(`/api/vbl/team/${externalTeamId}/matches`);
      if (!response.ok) throw new Error("Failed to fetch matches");
      const data = await response.json();
      
      const realMatches: ExternalMatch[] = data.map((m: any) => ({
        id: m.guid,
        matchId: m.wedstrijdNummer || m.id,
        homeTeam: m.thuisPloegNaam,
        awayTeam: m.uitPloegNaam,
        date: m.datumString || m.datum,
        time: m.beginTijd || "00:00",
        location: m.accommodatieNaam || "TBD",
        competition: m.competitieNaam || "Competitie"
      }));

      setMatches(realMatches);
      setSelectedMatchIds(new Set(realMatches.map(m => m.id)));
    } catch (err) {
      console.error(err);
      setError("Failed to load matches for this team.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCompetitions = async () => {
    setLoading(true);
    setError(null);
    setActiveMode('browse');
    try {
      const response = await fetch('/api/vbl/competitions');
      if (!response.ok) throw new Error("Failed to fetch competitions");
      const data = await response.json();
      setCompetitions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getCompMatches = async (compId: string) => {
    setLoading(true);
    setSelectedCompId(compId);
    setError(null);
    try {
      const response = await fetch(`/api/vbl/competition/${compId}/matches`);
      if (!response.ok) throw new Error("Failed to fetch matches");
      const data = await response.json();
      
      // Filter matches to find those involving teams that might be relevant
      // Or just show all and let user filter? VBL API returns all matches for the competition.
      const realMatches: ExternalMatch[] = data.map((m: any) => ({
        id: m.guid,
        matchId: m.wedstrijdNummer || m.id,
        homeTeam: m.thuisPloegNaam,
        awayTeam: m.uitPloegNaam,
        date: m.datumString || m.datum,
        time: m.beginTijd || "00:00",
        location: m.accommodatieNaam || "TBD",
        competition: m.competitieNaam || "Competitie"
      }));

      setMatches(realMatches);
      setSelectedMatchIds(new Set()); // Don't select all for a whole competition
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMatchSelection = (matchId: string) => {
    const newSelection = new Set(selectedMatchIds);
    if (newSelection.has(matchId)) {
      newSelection.delete(matchId);
    } else {
      newSelection.add(matchId);
    }
    setSelectedMatchIds(newSelection);
  };

  const importMatches = async () => {
    setImporting(true);
    try {
      const matchesToImport = matches.filter(m => selectedMatchIds.has(m.id));
      
      const promises = matchesToImport.map(match => {
        const event: Omit<CalendarEvent, 'id'> = {
          teamId: team.id,
          type: 'game',
          title: `${match.homeTeam} vs ${match.awayTeam}`,
          date: match.date,
          time: match.time,
          location: match.location,
          description: `Imported from Basketball Vlaanderen via HoopsAtlas.\nCompetition: ${match.competition}`,
          createdAt: Date.now()
        };
        return addDoc(collection(db, 'events'), event);
      });

      await Promise.all(promises);
      onImportComplete();
      onClose();
    } catch (error) {
      console.error("Error importing matches:", error);
      alert("Failed to import matches. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0b1224] border border-slate-800 w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-xl font-black italic uppercase text-white tracking-tighter">
              Import <span className="text-ha-brand">Matches</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              Source: Basketball Vlaanderen (Real-time)
              <a href="https://vblweb.wisseq.eu/Home/Competities" target="_blank" rel="noopener noreferrer" className="text-ha-brand hover:text-ha-brand underline">
                VBL Website
              </a>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold animate-in fade-in">
              {error}
            </div>
          )}

          {/* Mode Selection */}
          <div className="flex bg-ha-bg p-1 rounded-xl border border-slate-800">
            <button 
              onClick={() => setActiveMode('url')}
              className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeMode === 'url' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              URL Import
            </button>
            <button 
              onClick={() => setActiveMode('search')}
              className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeMode === 'search' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Search Club
            </button>
            <button 
              onClick={() => { setActiveMode('browse'); if (competitions.length === 0) fetchCompetitions(); }}
              className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeMode === 'browse' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Browse Competitions
            </button>
          </div>

          {activeMode === 'url' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-4 p-6 bg-slate-900/30 border border-slate-800 rounded-2xl">
                <label className="text-[10px] font-black uppercase text-ha-brand tracking-widest flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Import via URL
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlImport()}
                    placeholder="Paste Basketbal Vlaanderen team URL..." 
                    className="flex-1 bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-ha-brand outline-none transition-all placeholder:text-slate-600"
                  />
                  <button 
                    onClick={handleUrlImport}
                    disabled={loading || !urlInput.trim()}
                    className="bg-cyan-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-ha-brand transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Go'}
                  </button>
                </div>
                <p className="text-[8px] text-slate-500 italic">Example: https://www.basketbal.vlaanderen/ploeg/BVBL1234/heren-a</p>
              </div>
            </div>
          )}

          {activeMode === 'search' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Search Club</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchExternalTeams()}
                    placeholder="Search by club name (e.g. 'Falco')..." 
                    className="flex-1 bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-ha-brand outline-none transition-all placeholder:text-slate-600"
                  />
                  <button 
                    onClick={searchExternalTeams}
                    disabled={loading || !searchQuery.trim()}
                    className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMode === 'browse' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Browse Competitions</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={compSearch}
                    onChange={(e) => setCompSearch(e.target.value)}
                    placeholder="Filter competitions (e.g. 'U16', 'Heren', 'Provinciaal')..." 
                    className="w-full bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-ha-brand outline-none transition-all placeholder:text-slate-600 pr-10"
                  />
                  {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {competitions.length === 0 && !loading ? (
                  <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">No competitions found</p>
                    <button onClick={fetchCompetitions} className="mt-2 text-ha-brand text-[10px] font-black uppercase underline">Retry Fetch</button>
                  </div>
                ) : (
                  competitions
                    .filter(c => c.naam.toLowerCase().includes(compSearch.toLowerCase()))
                    .slice(0, 50) // Limit display for performance
                    .map(comp => (
                    <button 
                      key={comp.guid}
                      onClick={() => getCompMatches(comp.guid)}
                      className={`text-left p-4 rounded-xl border transition-all ${selectedCompId === comp.guid ? 'bg-cyan-600 border-ha-brand text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    >
                      <p className="text-xs font-bold uppercase tracking-tight">{comp.naam}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Select Team (from Search) */}
          {activeMode === 'search' && foundTeams.length > 0 && !selectedExternalTeamId && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-300">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Team</p>
              <div className="grid gap-2">
                {foundTeams.map(t => (
                  <button 
                    key={t.id}
                    onClick={() => getExternalMatches(t.id)}
                    className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-ha-brand/50 hover:bg-slate-900 transition-all text-left group"
                  >
                    <div>
                      <p className="font-bold text-white group-hover:text-ha-brand transition-colors">{t.name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{t.club}</span>
                        <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                        <span className="text-ha-brandDim">{t.division}</span>
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600 group-hover:text-ha-brand transform group-hover:translate-x-1 transition-all">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Select Matches */}
          {matches.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Upcoming Matches ({matches.length})</p>
                <button 
                  onClick={() => setSelectedExternalTeamId(null)}
                  className="text-[10px] font-bold text-ha-brand hover:text-ha-brand uppercase tracking-wider"
                >
                  Change Team
                </button>
              </div>
              
              <div className="space-y-2">
                {matches.map(match => (
                  <div 
                    key={match.id}
                    onClick={() => toggleMatchSelection(match.id)}
                    className={`p-4 border rounded-xl cursor-pointer transition-all flex items-center gap-4 ${selectedMatchIds.has(match.id) ? 'bg-cyan-900/20 border-ha-brand/50' : 'bg-ha-bg border-slate-800 hover:border-slate-700'}`}
                  >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selectedMatchIds.has(match.id) ? 'bg-ha-brand border-ha-brand' : 'border-slate-600'}`}>
                      {selectedMatchIds.has(match.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">{match.date} • {match.time}</span>
                          <span className="text-[9px] font-mono text-slate-600 bg-slate-900 px-1.5 rounded border border-slate-800">#{match.matchId}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{match.location}</span>
                      </div>
                      <p className="text-sm font-bold text-white">{match.homeTeam} <span className="text-slate-500 mx-1">vs</span> {match.awayTeam}</p>
                      <p className="text-[10px] text-ha-brandDim/70 uppercase tracking-wider mt-1">{match.competition}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition-colors text-xs uppercase tracking-wider"
          >
            Cancel
          </button>
          <button 
            onClick={importMatches}
            disabled={importing || selectedMatchIds.size === 0}
            className="px-8 py-3 bg-cyan-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-ha-brand transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? 'Importing...' : `Import ${selectedMatchIds.size} Matches`}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExternalMatchImport;
