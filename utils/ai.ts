import { Capacitor } from '@capacitor/core';
import { auth } from './firebase';

interface AIParams {
  model?: string;
  messages: any[];
  response_format?: { type: string };
  max_tokens?: number;
  temperature?: number;
}

export async function callAI(params: AIParams): Promise<string> {
  const envBase = (import.meta as any).env?.VITE_API_BASE_URL || '';
  const base = (!envBase && Capacitor.isNativePlatform())
    ? 'https://us-central1-hoopsatlas-e16e4.cloudfunctions.net'
    : envBase;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'AI request failed');
  }

  const data = await response.json();
  return data.content as string;
}
