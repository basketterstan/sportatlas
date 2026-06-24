import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase'; // Assuming firebase.ts exports db

const AI_USAGE_LIMIT = 100;

// Get current AI usage count for user
export const getAIUsage = async (userId: string): Promise<number> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  return userDoc.exists() ? userDoc.data()?.aiUsageCount || 0 : 0;
};

// Check if user can use AI (pro check + limit check), and increment if allowed
export const canUseAI = async (userId: string, isPro: boolean): Promise<{ allowed: boolean; message?: string }> => {
  if (!isPro) {
    return { allowed: false, message: 'AI features are only available for pro users. Upgrade your subscription.' };
  }
  const usage = await getAIUsage(userId);
  if (usage >= AI_USAGE_LIMIT) {
    return { allowed: false, message: 'You have reached your AI usage limit. Upgrade for more.' };
  }
  // Increment usage
  await updateDoc(doc(db, 'users', userId), { aiUsageCount: increment(1) });
  return { allowed: true };
};
