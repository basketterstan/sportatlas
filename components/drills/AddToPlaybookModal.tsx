import React, { useState, useMemo } from 'react';
import { type User } from 'firebase/auth';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { TrainingSession, UserProfile } from '../../types';
import { toast } from '../../utils/toast';

interface Props {
  drillId: string;
  trainingSessions: TrainingSession[];
  user: User;
  userProfile: UserProfile | null;
  onClose: () => void;
}

const AddToPlaybookModal: React.FC<Props> = ({ drillId, trainingSessions, user, userProfile, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return trainingSessions;
    const q = searchQuery.toLowerCase();
    return trainingSessions.filter(s => (s.name || '').toLowerCase().includes(q));
  }, [trainingSessions, searchQuery]);

  const handleAdd = async (sessionId: string) => {
    setIsAdding(true);
    try {
      const session = trainingSessions.find(s => s.id === sessionId);
      if (!session) throw new Error("Playbook not found");
      await updateDoc(doc(db, 'trainings', sessionId), {
        drillIds: [...(session.drillIds || []), drillId],
        updatedAt: Date.now()
      });
      toast.success("Drill added to playbook!");
      onClose();
    } catch (e) {
      console.error("Failed to add drill to playbook:", e);
      toast.error("Failed to add drill. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsAdding(true);
    try {
      await addDoc(collection(db, "trainings"), {
        userId: user.uid,
        authorName: userProfile?.name || 'Coach',
        name: newName.trim().toUpperCase(),
        drillIds: [drillId],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      toast.success("New playbook created!");
      onClose();
    } catch (e) {
      console.error("Failed to create playbook:", e);
      toast.error("Failed to create playbook.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-ha-bg/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-md space-y-6 shadow-3xl animate-in zoom-in duration-300">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Add to Playbook</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search playbooks..."
              className="w-full bg-ha-bg border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-[10px] font-black uppercase tracking-widest text-white outline-none focus:border-indigo-500 transition-all"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playbook name..."
              className="flex-1 bg-ha-bg border border-slate-800 rounded-xl py-3 px-4 text-[10px] font-black uppercase tracking-widest text-white outline-none focus:border-indigo-500 transition-all"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || isAdding}
              className="px-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-30"
            >
              Create
            </button>
          </div>
        </div>

        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">No matching playbooks</p>
            </div>
          ) : (
            filtered.map(session => (
              <button
                key={session.id}
                onClick={() => handleAdd(session.id)}
                disabled={isAdding}
                className="w-full p-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-left hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all group flex items-center justify-between"
              >
                <div>
                  <p className="font-black text-white uppercase italic group-hover:text-indigo-400 transition-colors">{session.name}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{(session.drillIds?.length || 0)} Drills</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-700 group-hover:text-indigo-400">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default AddToPlaybookModal;
