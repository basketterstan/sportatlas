import { getActivePlan } from './revenuecat';

export async function isProUser(): Promise<boolean> {
  try {
    const plan = await getActivePlan();
    return plan === 'pro';
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}
