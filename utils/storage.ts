
import { Drill } from '../types';
import { cleanObject, cleanRecord } from './firebase';
import { toast } from './toast';

const STORAGE_KEY = 'hoopsatlas_drills_v1';
const DRAFT_KEY = 'hoopsatlas_draft_v1';

export const loadDrillsFromStorage = (): Drill[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load drills:', error);
    return [];
  }
};

export const saveDrillsToStorage = (drills: Drill[]): void => {
  try {
    // Sanitize data before stringifying to prevent circular structure errors
    const sanitized = cleanObject(drills);
    const serialized = JSON.stringify(sanitized);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.error('Failed to save drills to storage:', error);
  }
};

export const saveDraftToStorage = (draft: unknown): void => {
  try {
    const sanitized = cleanRecord(draft);
    const data = JSON.stringify({
      ...sanitized,
      timestamp: Date.now()
    });
    localStorage.setItem(DRAFT_KEY, data);
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
};

export const loadDraftFromStorage = (): Record<string, unknown> | null => {
  try {
    const data = localStorage.getItem(DRAFT_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
};

export const clearDraftFromStorage = (): void => {
  localStorage.removeItem(DRAFT_KEY);
};

const PENDING_DRILL_KEY = 'ha_pending_drill';

export const savePendingDrill = (drill: Drill): void => {
  try {
    sessionStorage.setItem(PENDING_DRILL_KEY, JSON.stringify(cleanRecord(drill)));
  } catch {}
};

export const loadPendingDrill = (): Drill | null => {
  try {
    const data = sessionStorage.getItem(PENDING_DRILL_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
};

export const clearPendingDrill = (): void => {
  sessionStorage.removeItem(PENDING_DRILL_KEY);
};

export const exportDrillsAsJSON = (drills: Drill[]) => {
  try {
    const sanitized = cleanObject(drills);
    const dataStr = JSON.stringify(sanitized, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `hoopsatlas_backup_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  } catch (error) {
    toast.error("Export mislukt: data bevat niet-serialiseerbare onderdelen.");
    console.error("Export failure", error);
  }
};

export const validateImportedJSON = (data: unknown): data is Drill[] => {
  if (!Array.isArray(data)) return false;
  return data.every(drill => 
    drill &&
    typeof drill.id === 'string' &&
    typeof drill.title === 'string' &&
    typeof drill.createdAt === 'number'
  );
};
