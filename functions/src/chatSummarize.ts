import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/** Same allowlist as postAI / web callables; mobile has no Origin header and is allowed through. */
const CORS = [
  'https://momsfitnessmojo.com',
  'https://www.momsfitnessmojo.com',
  'https://momsfitnessmojo-65d00.web.app',
  'https://momsfitnessmojo-65d00.firebaseapp.com',
  'https://momsfitnessmojo-dev.web.app',
  'https://momsfitnessmojo-dev.firebaseapp.com',
  'https://momfitnessmojo.web.app',
  'https://momfitnessmojo.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:3000',
];

/**
 * Callable: summarize recent messages in a chat room (Gemini when GEMINI_API_KEY is set).
 */
export const summarizeChatRoom = onCall(
  {
    region: 'us-east1',
    cors: CORS,
    timeoutSeconds: 90,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required');
    }
    const roomId = request.data?.roomId;
    if (!roomId || typeof roomId !== 'string') {
      throw new HttpsError('invalid-argument', 'roomId is required');
    }

    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const u = userDoc.data() || {};
    const status = u['status'];
    if (status && status !== 'approved') {
      throw new HttpsError('permission-denied', 'Approved members only');
    }

    const snap = await db
      .collection('chatRooms')
      .doc(roomId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    if (snap.empty) {
      return { summary: 'No messages here yet. Say hi to start the chat!', usedAi: false };
    }

    const lines = snap.docs
      .map((doc) => {
        const m = doc.data();
        const ts = m['timestamp'] as Timestamp | undefined;
        const time = ts?.toDate?.()?.toISOString?.() ?? '';
        const name = String(m['senderName'] ?? 'Member');
        const type = String(m['type'] ?? 'text');
        if (type === 'voice') {
          return `[${time}] ${name}: (voice message)`;
        }
        const text = String(m['text'] ?? '');
        return `[${time}] ${name}: ${text}`;
      })
      .reverse();

    const transcript = lines.join('\n').slice(0, 12000);
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return {
        summary:
          'Recent messages (AI summary unavailable — set GEMINI_API_KEY on Functions):\n\n' +
          transcript.slice(0, 3500) +
          (transcript.length > 3500 ? '\n…' : ''),
        usedAi: false,
      };
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      const prompt =
        'You summarize a moms fitness community group chat. Output a short friendly catch-up: ' +
        'bullet points (max 8), themes, plans, questions. Stay family-friendly. Do not invent events not in the log.\n\n' +
        'Chat log:\n' +
        transcript;

      let lastErr: Error | null = null;
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          if (text?.trim()) {
            return { summary: text.trim(), usedAi: true };
          }
        } catch (e) {
          lastErr = e as Error;
          console.warn(`summarizeChatRoom model ${modelName} failed:`, (e as Error)?.message);
        }
      }
      throw lastErr || new Error('All Gemini models failed');
    } catch (e) {
      console.error('summarizeChatRoom Gemini error', e);
      return {
        summary:
          'Could not generate an AI summary. Recent messages:\n\n' +
          transcript.slice(0, 2500) +
          (transcript.length > 2500 ? '\n…' : ''),
        usedAi: false,
      };
    }
  }
);
