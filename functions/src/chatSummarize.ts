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

/**
 * Callable: 3 short smart-reply suggestions from recent room messages (Gemini when configured).
 */
export const getSmartReplies = onCall(
  {
    region: 'us-east1',
    cors: CORS,
    timeoutSeconds: 60,
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
    const role = String(u['role'] ?? '');
    if (status && status !== 'approved') {
      throw new HttpsError('permission-denied', 'Approved members only');
    }

    const roomSnap = await db.collection('chatRooms').doc(roomId).get();
    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Room not found');
    }
    const roomData = roomSnap.data() || {};
    const members = (roomData['memberIds'] as string[] | undefined) ?? [];
    const roomType = String(roomData['type'] ?? '');
    const isAdminOnly = roomData['isAdminOnly'] === true;
    const isOpenRoom = ['community', 'broadcast', 'channel'].includes(roomType);
    const canAccessRoom =
      role === 'admin' ||
      members.includes(request.auth.uid) ||
      (isOpenRoom && !isAdminOnly);
    if (!canAccessRoom) {
      throw new HttpsError('permission-denied', 'Not a member of this chat');
    }

    const snap = await db
      .collection('chatRooms')
      .doc(roomId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(15)
      .get();

    const fallbackFromLast = (): string[] => {
      if (snap.empty) {
        return ['Hi everyone!', 'How is everyone doing?', 'Excited for today!'];
      }
      const last = snap.docs[0].data();
      const lastText = String(last['text'] ?? '');
      if (lastText.includes('?')) {
        return ['Yes!', 'Not sure yet', 'Let me check'];
      }
      return ['👍', 'Thanks!', 'Sounds good'];
    };

    if (snap.empty) {
      return { replies: fallbackFromLast() };
    }

    const lines = snap.docs
      .map((doc) => {
        const m = doc.data();
        const name = String(m['senderName'] ?? 'Member');
        const type = String(m['type'] ?? 'text');
        if (type === 'voice') {
          return `${name}: (voice message)`;
        }
        const text = String(m['text'] ?? '');
        return `${name}: ${text}`;
      })
      .reverse();

    const transcript = lines.join('\n').slice(0, 8000);
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return { replies: fallbackFromLast() };
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
      const prompt =
        'You help with quick replies in a friendly moms fitness community group chat.\n' +
        'Given the recent messages below, suggest exactly 3 short reply options the user could send next.\n' +
        'Rules: max 6 words each, warm and supportive, no emojis unless one reply is a single emoji, ' +
        'no hashtags, no medical claims. Output ONLY a JSON array of 3 strings, e.g. ["Thanks!","Will do","👍"]\n\n' +
        'Recent messages:\n' +
        transcript;

      let lastErr: Error | null = null;
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const raw = result.response.text().trim();
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as unknown;
            if (Array.isArray(parsed) && parsed.length >= 1) {
              const replies = parsed
                .filter((x): x is string => typeof x === 'string')
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
                .slice(0, 3);
              if (replies.length >= 1) {
                while (replies.length < 3) {
                  replies.push('Thanks!');
                }
                return { replies: replies.slice(0, 3) };
              }
            }
          }
        } catch (e) {
          lastErr = e as Error;
          console.warn(`getSmartReplies model ${modelName} failed:`, (e as Error)?.message);
        }
      }
      console.warn('getSmartReplies parse/model failed', lastErr);
      return { replies: fallbackFromLast() };
    } catch (e) {
      console.error('getSmartReplies error', e);
      return { replies: fallbackFromLast() };
    }
  }
);

/**
 * Callable: one-line caption for an image URL (Gemini vision when configured).
 */
export const generateImageCaption = onCall(
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
    const imageUrl = request.data?.imageUrl;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      throw new HttpsError('invalid-argument', 'imageUrl must be an http(s) URL');
    }

    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const u = userDoc.data() || {};
    const status = u['status'];
    if (status && status !== 'approved') {
      throw new HttpsError('permission-denied', 'Approved members only');
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return {
        caption: 'A shared photo — add a short note when you post.',
      };
    }

    try {
      const res = await fetch(imageUrl, { redirect: 'follow' });
      if (!res.ok) {
        throw new HttpsError('invalid-argument', `Could not download image (${res.status})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const maxBytes = 4 * 1024 * 1024;
      if (buf.length > maxBytes) {
        throw new HttpsError('invalid-argument', 'Image too large');
      }
      const headerType = res.headers.get('content-type')?.split(';')[0]?.trim();
      const mimeType =
        headerType && headerType.startsWith('image/') ? headerType : 'image/jpeg';

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const modelsToTry = ['gemini-2.0-flash-exp', 'gemini-2.5-flash', 'gemini-1.5-flash'];
      const instruction =
        'Write one short friendly caption (max 18 words) for this image in a moms fitness community chat. ' +
        'No hashtags. If the image is unclear, describe it simply.';

      let lastErr: Error | null = null;
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: instruction },
                  {
                    inlineData: {
                      data: buf.toString('base64'),
                      mimeType,
                    },
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.4, maxOutputTokens: 120 },
          });
          const text = result.response.text().trim();
          if (text) {
            return { caption: text };
          }
        } catch (e) {
          lastErr = e as Error;
          console.warn(`generateImageCaption model ${modelName} failed:`, (e as Error)?.message);
        }
      }
      console.error('generateImageCaption failed', lastErr);
      return { caption: 'Shared photo' };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error('generateImageCaption error', e);
      throw new HttpsError('internal', 'Could not generate caption');
    }
  }
);
