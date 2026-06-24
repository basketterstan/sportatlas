import { Drill, TrainingSession } from '../types';
import { db, auth } from './firebase';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { toast } from './toast';

export interface ShareData {
  type: 'drill' | 'playbook';
  id: string;
  title: string;
  authorId: string;
}

export const parseShareUrl = (search: string): ShareData | null => {
  const params = new URLSearchParams(search);
  const shareParam = params.get('share');
  
  if (!shareParam) return null;
  
  try {
    const shareParams = new URLSearchParams(shareParam);
    return {
      type: (shareParams.get('type') as 'drill' | 'playbook') || 'drill',
      id: shareParams.get('id') || '',
      title: shareParams.get('title') || 'Untitled',
      authorId: shareParams.get('authorId') || '',
    };
  } catch (e) {
    return null;
  }
};

export const importSharedDrill = async (sourceId: string, authorId: string): Promise<Drill | null> => {
  if (!auth.currentUser) {
    toast.error('You must be logged in to import');
    return null;
  }

  try {
    // Fetch the source drill
    const sourceSnap = await getDoc(doc(db, 'drills', sourceId));
    if (!sourceSnap.exists()) {
      toast.error('Drill not found');
      return null;
    }

    const sourceDrill = sourceSnap.data() as Drill;
    
    // Create a copy for the current user
    const newDrill: Drill = {
      ...sourceDrill,
      id: `${sourceId}_copy_${Date.now()}`,
      userId: auth.currentUser.uid,
      isPublic: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save the new drill
    const docRef = await addDoc(collection(db, 'drills'), newDrill);
    
    toast.success(`Drill "${newDrill.title}" imported successfully!`);
    return { ...newDrill, id: docRef.id };
  } catch (e) {
    console.error('Failed to import drill:', e);
    toast.error('Failed to import drill');
    return null;
  }
};

export const importSharedPlaybook = async (sourceId: string, authorId: string): Promise<TrainingSession | null> => {
  if (!auth.currentUser) {
    toast.error('You must be logged in to import');
    return null;
  }

  try {
    // Fetch the source playbook
    const sourceSnap = await getDoc(doc(db, 'trainings', sourceId));
    if (!sourceSnap.exists()) {
      toast.error('Playbook not found');
      return null;
    }

    const sourcePlaybook = sourceSnap.data() as TrainingSession;
    
    // Create a copy for the current user
    const newPlaybook: TrainingSession = {
      ...sourcePlaybook,
      id: `${sourceId}_copy_${Date.now()}`,
      userId: auth.currentUser.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save the new playbook
    const docRef = await addDoc(collection(db, 'trainings'), newPlaybook);
    
    toast.success(`Playbook "${newPlaybook.name}" imported successfully!`);
    return { ...newPlaybook, id: docRef.id };
  } catch (e) {
    console.error('Failed to import playbook:', e);
    toast.error('Failed to import playbook');
    return null;
  }
};
