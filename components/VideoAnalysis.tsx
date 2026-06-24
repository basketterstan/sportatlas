import { isProUser } from '../utils/subscription';
import { callAI } from '../utils/ai';

async function analyzeVideo(video: File) {
  const pro = await isProUser();
  if (!pro) {
    alert('Upgrade to pro to use AI analysis.');
    return;
  }
  const content = await callAI({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: `Analyze this basketball video file: "${video.name}". Provide tactical feedback.` }
    ]
  });
  return content;
}
