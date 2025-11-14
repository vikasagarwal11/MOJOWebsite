import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory, SafetySetting } from '@google/generative-ai';
import { SpeechClient } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { v4 as uuidv4 } from 'uuid';
import { embedText } from './utils/embeddings';

const db = getFirestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn('[assistant] Missing GEMINI_API_KEY environment variable. Chat assistant will be disabled.');
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const speechClient = new SpeechClient();
const ttsClient = new TextToSpeechClient();

const safetySettings: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
];

type VisibilityLevel = 'public' | 'members' | 'private';

interface AssistantRequest {
  question?: string;
  sessionId?: string;
  history?: Array<{ from: 'user' | 'assistant'; text: string }>;
}

interface AssistantResponse {
  answer: string;
  sessionId: string;
  citations: Array<{
    id: string;
    title: string;
    url: string | null;
    sourceType: string;
    distance?: number;
    snippet: string;
  }>;
  rawSources: Array<Record<string, unknown>>;
}

function determineVisibility(userRole?: string): VisibilityLevel[] {
  if (!userRole) return ['public'];
  if (userRole === 'admin') return ['public', 'members', 'private'];
  return ['public', 'members'];
}

async function getUserProfile(uid: string | undefined) {
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    id: uid,
    displayName: data.displayName || null,
    role: data.role || null,
    environment: data.preferences?.preferredEnvironment || data.preferredEnvironment || null,
    equipment: Array.isArray(data.availableEquipment)
      ? data.availableEquipment
      : Array.isArray(data.preferences?.availableEquipment)
      ? data.preferences?.availableEquipment
      : [],
    restrictions: data.restrictions || data.preferences?.restrictions || null,
  };
}

async function answerQuestion(question: string, context: string, profileSummary: string) {
  if (!genAI) {
    throw new Error('Gemini client not configured');
  }

  const systemPrompt = [
    'You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.',
    'Use the provided context to answer questions. If you are unsure or the context does not contain the answer, reply with a brief apology and say you do not have that info.',
    'Always include inline citations using the format [#1], [#2], etc., where the numbers map to sources supplied separately by the UI.',
    'Do NOT include a separate "Sources" section in your answer (the UI renders sources).',
    'Prefer clear, plain sentences. Light markdown like **bold** is allowed, but avoid headings/tables.',
    'Keep answers concise (3-5 sentences) unless the user explicitly asks for more detail.',
    'Tone should be encouraging, knowledgeable, and aligned with women-focused community fitness.',
    profileSummary ? `Personalization hints: ${profileSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Prefer broadly available/managed aliases first to avoid 404s across API versions
  const preferredModels = [
    'gemini-2.5-flash',        // widely available, low latency
    'gemini-2.0-flash-exp',    // experimental but commonly enabled
    'gemini-1.5-flash-latest', // v1.5 managed alias
    'gemini-1.5-pro-latest',   // v1.5 managed alias
    'gemini-pro',              // legacy fallback
    'gemini-1.0-pro'           // legacy fallback
  ];

  const gen = async (modelName: string) =>
    await genAI
      .getGenerativeModel({
        model: modelName,
        safetySettings,
        generationConfig: {
          temperature: 0.3,
          topK: 32,
          topP: 0.9,
          maxOutputTokens: 1024,
        },
      })
      .generateContent(`${systemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}`);

  let result: any = null;
  let lastErr: any = null;
  for (const m of preferredModels) {
    try {
      console.log('[assistant.chatAsk] Trying model:', m);
      result = await gen(m);
      lastErr = null;
      console.log('[assistant.chatAsk] Using model:', m);
      break;
    } catch (e: any) {
      lastErr = e;
      // Try next model on 404 or unsupported endpoint errors
      const msg = (e?.message || '').toString().toLowerCase();
      console.warn('[assistant.chatAsk] Model failed:', m, '-', msg);
      if (!(msg.includes('404') || msg.includes('not found') || msg.includes('unsupported') || msg.includes('v1beta') || msg.includes('model'))) {
        break; // other error types should bubble
      }
    }
  }
  if (!result) throw lastErr || new Error('Failed to contact Gemini');

  const answer = result.response?.text();
  if (!answer) {
    throw new Error('Failed to generate answer');
  }
  return answer.trim();
}

function buildContextFromDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[], limit = 2000) {
  const contextPieces: string[] = [];
  let totalLength = 0;
  docs.forEach((doc, idx) => {
    const data = doc.data() || {};
    const chunkText = (data.text as string) || '';
    if (!chunkText) return;
    const title = (data.title as string) || data.sourceType || `Source ${idx + 1}`;
    const entry = `[#${idx + 1}] ${title}\n${chunkText}`;
    if (totalLength + entry.length <= limit) {
      contextPieces.push(entry);
      totalLength += entry.length;
    }
  });
  return contextPieces.join('\n\n');
}

export const chatAsk = onCall(
  { region: 'us-central1', timeoutSeconds: 60, memory: '1GiB' },
  async request => {
    if (!genAI) {
      throw new HttpsError('failed-precondition', 'Gemini API key is not configured');
    }

    const data = request.data as AssistantRequest;
    const question = (data?.question || '').toString().trim();
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required');
    }

    const uid = request.auth?.uid;
    const userProfile = await getUserProfile(uid);
    const allowedVisibility = determineVisibility(userProfile?.role || request.auth?.token?.role);
    const filterVisibilityServerSide = allowedVisibility.length === 1;

    const embedding = await embedText(question);

    let chunksQuery = db.collection('kb_chunks') as FirebaseFirestore.Query;
    if (filterVisibilityServerSide) {
      chunksQuery = chunksQuery.where('visibility', '==', allowedVisibility[0]);
    }

    const vectorQuery = chunksQuery.findNearest({
      vectorField: 'embedding',
      queryVector: embedding,
      limit: filterVisibilityServerSide ? 8 : 16,
      distanceMeasure: 'COSINE',
      distanceResultField: 'distance',
    });

    try {
      const snapshot = await vectorQuery.get();
      console.log('[assistant.chatAsk] vector query docs:', snapshot.size, 'filter server-side?', filterVisibilityServerSide);

      const docs = snapshot.docs.filter(doc => {
        if (filterVisibilityServerSide) return true;
        const visibility = ((doc.get('visibility') as string) || 'public') as typeof allowedVisibility[number];
        return allowedVisibility.includes(visibility);
      });
      console.log('[assistant.chatAsk] visible docs after filter:', docs.length);

      if (!docs.length) {
        return {
          answer:
            'I could not find information about that yet. Please check back after we finish organizing the knowledge base.',
          sessionId: data.sessionId || uuidv4(),
          citations: [],
          rawSources: [],
        } satisfies AssistantResponse;
      }

      // Deduplicate by sourceKey to avoid multiple chunks from the same source
      const dedupedDocs = (() => {
        const seen = new Set<string>();
        const out: typeof docs = [] as any;
        for (const d of docs) {
          const sk = (d.get('sourceKey') as string) || d.id;
          if (seen.has(sk)) continue;
          seen.add(sk);
          out.push(d);
          if (out.length >= 8) break;
        }
        return out.length ? out : docs;
      })();

      const context = buildContextFromDocs(dedupedDocs, 2500);

      const profileSummary = userProfile
        ? [
            userProfile.environment ? `Prefers ${userProfile.environment} workouts.` : '',
            userProfile.equipment?.length ? `Has equipment: ${userProfile.equipment.join(', ')}.` : '',
            userProfile.restrictions ? `Restrictions: ${JSON.stringify(userProfile.restrictions)}.` : '',
          ]
            .filter(Boolean)
            .join(' ')
        : '';

      const answer = await answerQuestion(question, context, profileSummary);

      const sessionId = data.sessionId || uuidv4();
      const sessionRef = db.collection('chat_sessions').doc(sessionId);
      const now = FieldValue.serverTimestamp();
      // Use Timestamp.now() for array elements - serverTimestamp() cannot be used inside arrays
      const messageTimestamp = Timestamp.now();
      const transcriptEntry = {
        question,
        answer,
        createdAt: messageTimestamp,
        userId: uid ?? null,
        metadata: {
          profile: userProfile,
          allowedVisibility,
        },
      };

      await sessionRef.set(
        {
          sessionId,
          userId: uid ?? null,
          updatedAt: now,
          createdAt: FieldValue.serverTimestamp(),
          messages: FieldValue.arrayUnion(transcriptEntry),
        },
        { merge: true }
      );

      const citations = dedupedDocs.map((doc, idx) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          title: (data.title as string) || data.sourceType || `Source ${idx + 1}`,
          url: (data.url as string) || null,
          sourceType: (data.sourceType as string) || 'kb',
          distance: (data as any).distance ?? null,
          snippet: ((data.text as string) || '').slice(0, 220),
        };
      });

      return {
        answer,
        sessionId,
        citations,
        rawSources: docs.map(doc => doc.data()),
      } satisfies AssistantResponse;
    } catch (error: any) {
      console.error('[assistant.chatAsk] error', error);
      const msg = (error?.message || '').toString();
      // Friendly fallback if vector search/index isn't ready yet
      if (msg.includes('findNearest') || msg.includes('FAILED_PRECONDITION') || msg.includes('index')) {
        return {
          answer: 'I don\'t have access to the knowledge base yet. Please try again shortly while we finish indexing our content.',
          sessionId: data.sessionId || uuidv4(),
          citations: [],
          rawSources: [],
        } satisfies AssistantResponse;
      }
      throw new HttpsError('internal', error?.message || 'Failed to query knowledge base');
    }
  }
);

export const transcribeAudio = onCall(
  { region: 'us-central1', timeoutSeconds: 60, memory: '512MiB' },
  async request => {
    const audioContent = (request.data?.audioContent || '').toString();
    if (!audioContent) {
      throw new HttpsError('invalid-argument', 'audioContent (base64) is required');
    }

    const encoding = (request.data?.encoding || 'WEBM_OPUS').toString();
    const sampleRateHertz =
      typeof request.data?.sampleRateHertz === 'number' ? request.data.sampleRateHertz : 48000;

    try {
      const [response] = await speechClient.recognize({
        audio: { content: audioContent },
        config: {
          encoding,
          sampleRateHertz,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
        },
      });

      const transcript =
        response.results
          ?.map(result => result.alternatives?.[0]?.transcript ?? '')
          .filter(Boolean)
          .join(' ')
          .trim() ?? '';

      return {
        transcript,
        isFinal: true,
      };
    } catch (error: any) {
      console.error('[assistant.transcribeAudio] error', error);
      throw new HttpsError('internal', error?.message || 'Failed to transcribe audio');
    }
  }
);

export const synthesizeSpeech = onCall(
  { region: 'us-central1', timeoutSeconds: 60, memory: '512MiB' },
  async request => {
    const text = (request.data?.text || '').toString().trim();
    if (!text) {
      throw new HttpsError('invalid-argument', 'text is required');
    }

    try {
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode: 'en-US',
          ssmlGender: 'FEMALE',
          name: 'en-US-Neural2-F',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.05,
        },
      });

      const audioContent = response.audioContent?.toString('base64') ?? '';
      return { audioContent };
    } catch (error: any) {
      console.error('[assistant.synthesizeSpeech] error', error);
      throw new HttpsError('internal', error?.message || 'Failed to synthesize speech');
    }
  }
);

