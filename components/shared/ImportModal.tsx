import React, { useState, useEffect } from 'react';
import { ShareData, importSharedDrill, importSharedPlaybook } from '../../utils/sharing';
import { toast } from '../../utils/toast';

interface ImportModalProps {
  shareData: ShareData;
  onClose: () => void;
  onImported: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ shareData, onClose, onImported }) => {
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      if (shareData.type === 'drill') {
        await importSharedDrill(shareData.id, shareData.authorId);
      } else {
        await importSharedPlaybook(shareData.id, shareData.authorId);
      }
      onImported();
      onClose();
    } catch (e) {
      console.error('Import failed:', e);
      toast.error('Import failed. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-ha-bg/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-md space-y-6 shadow-3xl animate-in zoom-in duration-300">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">
            Import {shareData.type === 'drill' ? 'Drill' : 'Playbook'}
          </h3>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="text-slate-500 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
              {shareData.type === 'drill' ? 'Drill' : 'Playbook'} Title
            </p>
            <p className="text-lg font-black italic uppercase text-white truncate">
              {shareData.title}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
              Type
            </p>
            <p className="text-[11px] font-bold uppercase text-slate-400">
              {shareData.type === 'drill' ? 'Basketball Drill' : 'Training Playbook'}
            </p>
          </div>
        </div>

        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
          This will create a copy of the shared {shareData.type === 'drill' ? 'drill' : 'playbook'} in your library. The original remains with the author.
        </p>

        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
