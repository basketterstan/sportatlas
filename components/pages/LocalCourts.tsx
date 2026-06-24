
import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, limit } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { callAI } from '../../utils/ai';
import { RegisteredCourt } from '../../types';
import L from 'leaflet';

interface LocalCourtsProps {
  onBack: () => void;
}

interface CourtInfo {
  name: string;
  uri: string;
  lat: number;
  lng: number;
  isDemo?: boolean;
  type?: string;
}

const LocalCourts: React.FC<LocalCourtsProps> = ({ onBack }) => {
  const [courts, setCourts] = useState<CourtInfo[]>([]);
  const [userCourts, setUserCourts] = useState<RegisteredCourt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newType, setNewType] = useState<'indoor' | 'outdoor'>('outdoor');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerId = "map-tactical-grounds";

  useEffect(() => {
    if (!loading && !error && (userLocation || courts.length > 0 || userCourts.length > 0)) {
      const timer = setTimeout(() => {
        const initialLat = userLocation?.[0] || userCourts[0]?.lat || 52.3676;
        const initialLng = userLocation?.[1] || userCourts[0]?.lng || 4.9041;

        if (!mapRef.current) {
          mapRef.current = L.map(mapContainerId).setView([initialLat, initialLng], 14);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(mapRef.current);
        } else {
          mapRef.current.setView([initialLat, initialLng], 14);
        }

        mapRef.current.eachLayer((layer) => {
          if (layer instanceof L.Marker) {
            mapRef.current?.removeLayer(layer);
          }
        });

        const emeraldIcon = L.divIcon({
          className: 'custom-div-icon',
          html: "<div style='background-color:#10b981; width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px #10b981;'></div>",
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        const userIcon = L.divIcon({
          className: 'user-pos-icon',
          html: "<div style='background-color:#3b82f6; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow: 0 0 15px #3b82f6;'></div>",
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        if (userLocation) {
          L.marker(userLocation, { icon: userIcon })
            .addTo(mapRef.current!)
            .bindPopup(`<b style="color:#0E1013">Your Position</b>`);
        }

        courts.forEach(c => {
          if (c.lat && c.lng) {
            L.marker([c.lat, c.lng], { icon: emeraldIcon })
              .addTo(mapRef.current!)
              .bindPopup(`<b style="color:#0E1013">${c.name}</b><br/><a href="${c.uri}" target="_blank" style="color:#10b981; font-weight:bold;">Open in Maps</a>`);
          }
        });

        userCourts.forEach(c => {
          L.marker([c.lat, c.lng], { icon: emeraldIcon })
            .addTo(mapRef.current!)
            .bindPopup(`<b style="color:#0E1013">${c.name} (Verified)</b><br/><i>${c.type}</i>`);
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, courts, userCourts, error, userLocation]);

  useEffect(() => {
    const q = query(collection(db, "courts"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const list: RegisteredCourt[] = [];
      snap.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as RegisteredCourt));
      setUserCourts(list);
    }, (err) => console.error("Courts Registry Error:", err));
    return () => unsub();
  }, []);

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSearch.trim()) return;
    setLoading(true);
    setError(null);
    setDescription('');

    try {
      const maxRetries = 2;
      let attempt = 0;
      let success = false;
      let coords = { lat: 0, lng: 0 };

      while (attempt <= maxRetries && !success) {
        try {
          const geoText = await callAI({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'You are a precise geocoder. Return ONLY valid JSON.' },
              { role: 'user', content: `What are the latitude and longitude coordinates for "${manualSearch}"? Return ONLY a JSON object: {"lat": number, "lng": number}. Do not include markdown formatting.` }
            ],
            response_format: { type: 'json_object' }
          });
          if (!geoText) throw new Error("No response from AI");

          const cleanJson = geoText.replace(/```json|```/g, '').trim();
          coords = JSON.parse(cleanJson);
          success = true;
        } catch (e: any) {
          console.error(`Geo attempt ${attempt + 1} failed:`, e);
          attempt++;
          if (attempt > maxRetries) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      if (coords.lat && coords.lng) {
        setUserLocation([coords.lat, coords.lng]);
        await performAiCourtSearch(coords.lat, coords.lng);
      } else {
        throw new Error("Invalid coordinates");
      }
    } catch (err) {
      setError("Manual uplink failed. Could not locate this sector.");
      setLoading(false);
    }
  };

  const fetchCourtsAuto = () => {
    setLoading(true);
    setError(null);
    setDescription('');

    if (!navigator.geolocation) {
      setError("Tactical GPS not supported. Enter your sector manually below.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        await performAiCourtSearch(latitude, longitude);
      },
      (geoErr) => {
        let msg = "GPS Signal Blocked. Use manual entry below.";
        if (geoErr.code === 3) msg = "GPS Timeout. Satellite link weak.";
        setError(msg);
        setLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const extractCoordsFromUri = (uri: string, fallbackLat: number, fallbackLng: number): { lat: number, lng: number } => {
    const atMatch = uri.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }
    const exclamationMatch = uri.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (exclamationMatch) {
      return { lat: parseFloat(exclamationMatch[1]), lng: parseFloat(exclamationMatch[2]) };
    }
    return { 
      lat: fallbackLat + (Math.random() - 0.5) * 0.005, 
      lng: fallbackLng + (Math.random() - 0.5) * 0.005 
    };
  };

  const performAiCourtSearch = async (latitude: number, longitude: number) => {
    setLoading(true);
    
    const maxRetries = 2;
    let attempt = 0;
    let success = false;

    while (attempt <= maxRetries && !success) {
      try {
        const description = await callAI({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that provides information about basketball courts.' },
            { role: 'user', content: `I am at coordinates (${latitude}, ${longitude}). Describe the area and suggest where to look for publicly accessible basketball courts nearby.` }
          ],
          max_tokens: 200
        });

        setDescription(description);

        setCourts([
          { name: "Search Basketball Courts", uri: `https://www.google.com/maps/search/basketball+court/@${latitude},${longitude},14z`, lat: latitude + 0.002, lng: longitude + 0.002 },
          { name: "Search Outdoor Courts", uri: `https://www.google.com/maps/search/outdoor+basketball/@${latitude},${longitude},14z`, lat: latitude - 0.002, lng: longitude - 0.002 }
        ]);
        success = true;
      } catch (aiErr: any) {
        console.error(`Court search attempt ${attempt + 1} failed:`, aiErr);
        attempt++;
        if (attempt > maxRetries) {
          setError("AI Grounding Link Failed.");
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCourtsAuto();
  }, []);

  const handleAddCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newName.trim() || !userLocation) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "courts"), {
        userId: auth.currentUser.uid,
        name: newName.toUpperCase(),
        address: newAddress,
        type: newType,
        lat: userLocation[0],
        lng: userLocation[1],
        createdAt: Date.now()
      });
      setNewName('');
      setNewAddress('');
      setShowAddForm(false);
    } catch (err) {
      alert("Transmission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-32">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-2">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">Tactical <span className="text-emerald-400">Grounds</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">High-Speed Sector Scanning</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-95">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="px-2 space-y-4">
        <form onSubmit={handleManualSearch} className="flex gap-2">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-600 group-focus-within:text-emerald-500 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <input 
              type="text" 
              value={manualSearch} 
              onChange={e => setManualSearch(e.target.value)} 
              placeholder="SEARCH CITY MANUALLY..." 
              className="w-full bg-[#0b1224] border border-slate-800 rounded-2xl py-4 pl-12 pr-6 text-[10px] font-black uppercase text-white outline-none focus:border-emerald-500 shadow-inner"
            />
          </div>
          <button type="submit" disabled={loading || !manualSearch.trim()} className="px-6 bg-slate-900 border border-slate-800 rounded-2xl text-white font-black text-[10px] uppercase hover:border-emerald-500 transition-all active:scale-95 disabled:opacity-30">Scan</button>
        </form>
      </div>

      <div className="space-y-4 px-2">
        <div id={mapContainerId} className={`h-72 w-full rounded-[3rem] border shadow-2xl overflow-hidden bg-ha-bg transition-colors duration-500 ${error ? 'border-red-500/30' : 'border-emerald-500/20'}`}></div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddCourt} className="bg-[#0b1224] border border-emerald-500/30 p-8 rounded-[2.5rem] space-y-6 shadow-3xl animate-in zoom-in mx-2">
           <h3 className="text-sm font-black italic uppercase text-white">Registry Override</h3>
           <div className="space-y-4">
             <input required type="text" placeholder="NAME OF UNIT..." value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-ha-bg border border-slate-800 p-4 rounded-xl text-xs text-white font-black outline-none focus:border-emerald-500 shadow-inner" />
             <input type="text" placeholder="ADDRESS..." value={newAddress} onChange={e => setNewAddress(e.target.value)} className="w-full bg-ha-bg border border-slate-800 p-4 rounded-xl text-xs text-white font-black outline-none focus:border-emerald-500 shadow-inner" />
             <div className="grid grid-cols-2 gap-2">
               <button type="button" onClick={() => setNewType('outdoor')} className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${newType === 'outdoor' ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-lg' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}>Outdoor</button>
               <button type="button" onClick={() => setNewType('indoor')} className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${newType === 'indoor' ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-lg' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}>Indoor</button>
             </div>
           </div>
           <div className="flex gap-2">
             <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 py-4 bg-slate-900 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest">Abort</button>
             <button type="submit" disabled={isSubmitting} className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] shadow-xl active:scale-95">{isSubmitting ? 'Transmitting...' : 'Confirm Data'}</button>
           </div>
        </form>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-8 px-2">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-500/10 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(16,185,129,0.3)]"></div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400 animate-pulse text-center">Fast Uplink Active...</p>
        </div>
      ) : error ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-[2.5rem] p-10 text-center space-y-6 mx-2 shadow-2xl">
           <svg className="mx-auto text-red-500 opacity-40" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <div className="space-y-2">
             <h3 className="text-xl font-black italic uppercase text-white">Signal Lost</h3>
             <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">{error}</p>
           </div>
           <button onClick={fetchCourtsAuto} className="w-full py-4 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl">Retry Sector Link</button>
        </div>
      ) : (
        <div className="space-y-10 px-2 animate-in fade-in slide-in-from-bottom-2">
          {description && (
            <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-4 shadow-xl">
               <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Fast Intel Brief</p>
               <div className="text-slate-300 text-[13px] leading-relaxed font-medium uppercase tracking-tight">
                 {description.split('\n').map((line, i) => <p key={i} className="mb-2">{line}</p>)}
               </div>
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] px-4">Tactical Data Points</h4>
            <div className="grid grid-cols-1 gap-4">
              {userCourts.map((court) => (
                <div key={court.id} className="group bg-[#0b1224] border border-emerald-500/30 rounded-[2rem] p-6 flex items-center justify-between shadow-2xl">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xl font-black italic uppercase text-white tracking-tight">{court.name}</h4>
                      <p className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.3em]">Verified Operational Unit • {court.type}</p>
                    </div>
                  </div>
                </div>
              ))}
              {courts.map((court, idx) => (
                <a 
                  key={idx} 
                  href={court.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group bg-[#0b1224] border border-slate-800 rounded-[2rem] p-6 flex items-center justify-between hover:border-emerald-500/40 transition-all shadow-2xl active:scale-[0.98]"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-ha-bg border border-slate-900 rounded-2xl flex items-center justify-center text-slate-800 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all shadow-inner">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xl font-black italic uppercase text-white tracking-tight group-hover:text-emerald-400 transition-colors">{court.name}</h4>
                      </div>
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em]">AI-Grounding Fast Link</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-ha-bg rounded-xl flex items-center justify-center text-emerald-400 group-hover:translate-x-1 transition-transform">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalCourts;
