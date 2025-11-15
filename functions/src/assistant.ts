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

// Default prompt for KB context answers
const DEFAULT_KB_CONTEXT_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.
Use the provided context to answer questions. If you are unsure or the context does not contain the answer, reply with a brief apology and say you do not have that info. IMPORTANT: If the context does not contain the answer, do NOT include any citations (no [#1], [#2], etc.).
Only include inline citations using the format [#1], [#2], etc., when the context actually contains relevant information that answers the question. The numbers map to sources supplied separately by the UI.
Do NOT include a separate "Sources" section in your answer (the UI renders sources when available).
Prefer clear, plain sentences. Light markdown like **bold** is allowed, but avoid headings/tables.
Keep answers concise (3-5 sentences) unless the user explicitly asks for more detail.
Tone should be encouraging, knowledgeable, and aligned with women-focused community fitness.`;

// Default prompt for general knowledge answers
const DEFAULT_GENERAL_KNOWLEDGE_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.

When answering questions using general knowledge, focus exclusively on:
- Lifestyle, fitness, and general health topics
- Women's wellness and fitness
- Community support and motivation
- Safe exercise practices
- Nutrition and wellness tips
- Balancing fitness with motherhood

Do NOT answer questions about:
- Medical diagnoses or treatments
- Specific medical conditions (refer to healthcare professionals)
- Legal or financial advice
- Topics unrelated to fitness, wellness, or lifestyle

Keep answers encouraging, knowledgeable, and aligned with women-focused community fitness.
If a question falls outside your scope, politely redirect to fitness/wellness topics or suggest consulting a professional.
Include a citation marker [#1] at the end of your answer to indicate it is from general knowledge.
Do NOT include a separate "Sources" section in your answer (the UI renders sources).
Prefer clear, plain sentences. Light markdown like **bold** is allowed, but avoid headings/tables.
Keep answers concise (3-5 sentences) unless the user explicitly asks for more detail.`;

// Default prompt when no context and general knowledge is disabled
const DEFAULT_NO_CONTEXT_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.
If you are unsure or do not have the information, reply with a brief apology and say you do not have that info.
Do not include citations when answering from general knowledge (no source numbers needed).
Prefer clear, plain sentences. Light markdown like **bold** is allowed, but avoid headings/tables.
Keep answers concise (3-5 sentences) unless the user explicitly asks for more detail.
Tone should be encouraging, knowledgeable, and aligned with women-focused community fitness.`;

async function getAssistantConfig(): Promise<{ 
  kbContextPrompt?: string;
  generalKnowledgePrompt?: string;
  noContextPrompt?: string;
}> {
  try {
    const configRef = db.collection('assistant_config').doc('system_config');
    const configSnap = await configRef.get();
    
    if (configSnap.exists) {
      const data = configSnap.data() || {};
      return {
        kbContextPrompt: data.kbContextPrompt || DEFAULT_KB_CONTEXT_PROMPT,
        generalKnowledgePrompt: data.generalKnowledgePrompt || DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
        noContextPrompt: data.noContextPrompt || DEFAULT_NO_CONTEXT_PROMPT,
      };
    }
    
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
    };
  } catch (error: any) {
    console.error('[assistant.getAssistantConfig] Error fetching config:', error);
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
    };
  }
}

async function answerQuestion(question: string, context: string, profileSummary: string, allowGeneralKnowledge = false) {
  const hasContext = context && context.trim().length > 0;
  
  // Get assistant config for all prompts (with fallback to defaults)
  let kbContextPrompt = DEFAULT_KB_CONTEXT_PROMPT;
  let generalKnowledgePrompt = DEFAULT_GENERAL_KNOWLEDGE_PROMPT;
  let noContextPrompt = DEFAULT_NO_CONTEXT_PROMPT;
  
  try {
    const config = await getAssistantConfig();
    kbContextPrompt = config.kbContextPrompt || DEFAULT_KB_CONTEXT_PROMPT;
    generalKnowledgePrompt = config.generalKnowledgePrompt || DEFAULT_GENERAL_KNOWLEDGE_PROMPT;
    noContextPrompt = config.noContextPrompt || DEFAULT_NO_CONTEXT_PROMPT;
    console.log('[assistant.answerQuestion] Using configured prompts from Firestore');
  } catch (error: any) {
    console.warn('[assistant.answerQuestion] Failed to load config, using defaults:', error);
  }
  
  // Build system prompt based on context availability
  let systemPrompt: string;
  if (hasContext) {
    // KB context available - use KB context prompt
    systemPrompt = kbContextPrompt;
    if (profileSummary) {
      systemPrompt += `\n\nPersonalization hints: ${profileSummary}`;
    }
  } else if (allowGeneralKnowledge) {
    // No KB context, but general knowledge allowed - use general knowledge prompt
    systemPrompt = generalKnowledgePrompt;
    if (profileSummary) {
      systemPrompt += `\n\nPersonalization hints: ${profileSummary}`;
    }
  } else {
    // No context and general knowledge disabled - use no context prompt
    systemPrompt = noContextPrompt;
    if (profileSummary) {
      systemPrompt += `\n\nPersonalization hints: ${profileSummary}`;
    }
  }

  // Build prompt: include context only if available
  const prompt = hasContext
    ? `${systemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}`
    : `${systemPrompt}\n\nQuestion: ${question}`;

  const temperature = hasContext ? 0.3 : 0.7; // Slightly more creative when using general knowledge

  // Try Gemini first if available
  if (genAI) {
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
            temperature,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 1024,
          },
        })
        .generateContent(prompt);

    let result: any = null;
    let lastErr: any = null;
    for (const m of preferredModels) {
      try {
        console.log('[assistant.answerQuestion] Trying Gemini model:', m);
        result = await gen(m);
        lastErr = null;
        console.log('[assistant.answerQuestion] ✅ Success with Gemini model:', m);
        const answer = result.response?.text()?.trim();
        if (answer) {
          // For general knowledge answers, ensure citation marker is present
          if (allowGeneralKnowledge && !hasContext && !answer.includes('[#1]')) {
            return `${answer} [#1]`;
          }
          return answer;
        }
      } catch (e: any) {
        lastErr = e;
        // Try next model on 404 or unsupported endpoint errors
        const msg = (e?.message || '').toString().toLowerCase();
        console.warn('[assistant.answerQuestion] Gemini model failed:', m, '-', msg);
        // Continue to next model for retryable errors
        if (!(msg.includes('404') || msg.includes('not found') || msg.includes('unsupported') || msg.includes('v1beta') || msg.includes('model') || msg.includes('quota') || msg.includes('rate limit'))) {
          // For non-retryable errors, break and try OpenAI
          break;
        }
      }
    }
    
    // If we got here, all Gemini models failed
    if (lastErr) {
      console.warn('[assistant.answerQuestion] ⚠️ All Gemini models failed, falling back to OpenAI');
    }
  } else {
    console.log('[assistant.answerQuestion] Gemini not configured, trying OpenAI');
  }

  // Fallback to OpenAI
  let openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const functions = require('firebase-functions');
      const config = functions.config();
      openaiApiKey = config?.openai?.api_key;
    } catch (error) {
      // functions.config() not available in v2, ignore
    }
  }

  if (!openaiApiKey) {
    throw new Error('Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured. Please add at least one API key.');
  }

  console.log('[assistant.answerQuestion] 🤖 Using OpenAI as fallback');
  
  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // OpenAI models to try (cheapest first)
    const openaiModels = [
      'gpt-4o-mini',     // Cheapest, fast, good quality
      'gpt-3.5-turbo',   // Legacy fallback
      'gpt-4o',          // Best quality (more expensive)
    ];

    for (const model of openaiModels) {
      try {
        console.log('[assistant.answerQuestion] Trying OpenAI model:', model);
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: hasContext ? `Context:\n${context}\n\nQuestion: ${question}` : question }
          ],
          temperature,
          max_tokens: 1024,
        });

        const answer = completion.choices[0]?.message?.content?.trim();
        if (answer) {
          console.log('[assistant.answerQuestion] ✅ Success with OpenAI model:', model);
          // For general knowledge answers, ensure citation marker is present
          if (allowGeneralKnowledge && !hasContext && !answer.includes('[#1]')) {
            return `${answer} [#1]`;
          }
          return answer;
        }
      } catch (e: any) {
        const msg = (e?.message || '').toString().toLowerCase();
        console.warn('[assistant.answerQuestion] OpenAI model failed:', model, '-', msg);
        // If it's a quota/rate limit error, try next model
        if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429')) {
          continue;
        }
        // For other errors, break and throw
        if (model !== openaiModels[openaiModels.length - 1]) {
          continue; // Try next model
        }
        throw e;
      }
    }
  } catch (error: any) {
    console.error('[assistant.answerQuestion] ❌ OpenAI fallback failed:', error?.message);
    throw new Error(`Failed to generate answer with both Gemini and OpenAI: ${error?.message || 'Unknown error'}`);
  }

  throw new Error('Failed to generate answer with all available providers');
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
    try {
      const data = request.data as AssistantRequest;
      const question = (data?.question || '').toString().trim();
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required');
    }

    const uid = request.auth?.uid;
    const userProfile = await getUserProfile(uid);
    const allowedVisibility = determineVisibility(userProfile?.role || request.auth?.token?.role);
    const filterVisibilityServerSide = allowedVisibility.length === 1;

    // Try to get embeddings for KB search, but continue even if it fails (will use general knowledge)
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(question);
    } catch (error: any) {
      console.warn('[assistant.chatAsk] Failed to get embeddings, will skip KB search and use general knowledge:', error?.message);
      // Continue without embeddings - will fall back to general knowledge
    }

    // Only perform KB search if we have embeddings
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (embedding) {
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

        docs = snapshot.docs.filter(doc => {
          if (filterVisibilityServerSide) return true;
          const visibility = ((doc.get('visibility') as string) || 'public') as typeof allowedVisibility[number];
          return allowedVisibility.includes(visibility);
        });
        console.log('[assistant.chatAsk] visible docs after filter:', docs.length);

        // Check similarity threshold - if best match is too distant, use general knowledge
        // Cosine distance: 0.0 = perfect match, 1.0 = completely different
        // Threshold of 0.3 means we only use KB if similarity is > 70% (distance < 0.3)
        // This ensures we only use KB for very specific questions about Moms Fitness Mojo
        // General advice questions (motivation, exercises, etc.) will fall back to general knowledge
        const SIMILARITY_THRESHOLD = 0.3;
        const bestDistance = docs.length > 0 ? (docs[0].get('distance') as number | undefined) : undefined;
        
        // Count how many matches meet the threshold
        const goodMatches = docs.filter(d => {
          const dist = d.get('distance') as number | undefined;
          return dist !== undefined && dist < SIMILARITY_THRESHOLD;
        });
        
        // If distance is not available, default to not confident (will use general knowledge)
        // Require at least 1 good match with distance < threshold
        const isConfidentMatch = bestDistance !== undefined && bestDistance < SIMILARITY_THRESHOLD && goodMatches.length >= 1;
        
        console.log('[assistant.chatAsk] Best match distance:', bestDistance, 'threshold:', SIMILARITY_THRESHOLD, 'good matches:', goodMatches.length, 'confident?', isConfidentMatch);
        
        // Log all distances for debugging
        if (docs.length > 0) {
          const distances = docs.slice(0, 5).map(d => d.get('distance')).filter(d => d !== undefined);
          console.log('[assistant.chatAsk] Top 5 distances:', distances);
        }

          // If no KB results OR similarity is too low, break out to general knowledge fallback
          if (!docs.length || !isConfidentMatch) {
            const reason = !docs.length 
              ? 'No KB results found' 
              : !bestDistance 
                ? 'Distance not available from vector search'
                : bestDistance >= SIMILARITY_THRESHOLD
                  ? `KB results not confident enough (distance: ${bestDistance.toFixed(3)}, threshold: ${SIMILARITY_THRESHOLD})`
                  : `No good matches found (${goodMatches.length} match(es) below threshold)`;
            console.log('[assistant.chatAsk]', reason, '- using general knowledge fallback');
            docs = []; // Clear docs to trigger general knowledge fallback below
          }
        } catch (error: any) {
          console.warn('[assistant.chatAsk] KB search failed, using general knowledge fallback:', error?.message);
          docs = []; // Clear docs to trigger general knowledge fallback
        }
      }

      // If we have confident KB matches, use them
      if (docs.length > 0) {
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
            source: 'knowledge_base', // Mark as KB-based answer
            kbChunksFound: dedupedDocs.length,
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
      }

      // Fall back to general knowledge if no KB results or embeddings unavailable
      console.log('[assistant.chatAsk] No KB results or embeddings unavailable - using general knowledge fallback');
      
      const profileSummary = userProfile
        ? [
            userProfile.environment ? `Prefers ${userProfile.environment} workouts.` : '',
            userProfile.equipment?.length ? `Has equipment: ${userProfile.equipment.join(', ')}.` : '',
            userProfile.restrictions ? `Restrictions: ${JSON.stringify(userProfile.restrictions)}.` : '',
          ]
            .filter(Boolean)
            .join(' ')
        : '';
      
      const answer = await answerQuestion(question, '', profileSummary, true);
      
      const sessionId = data.sessionId || uuidv4();
      const sessionRef = db.collection('chat_sessions').doc(sessionId);
      const now = FieldValue.serverTimestamp();
      const messageTimestamp = Timestamp.now();
      const transcriptEntry = {
        question,
        answer,
        createdAt: messageTimestamp,
        userId: uid ?? null,
        metadata: {
          profile: userProfile,
          allowedVisibility,
          source: 'general_knowledge', // Mark as general knowledge answer
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

      // Include a citation for general knowledge answers
      const generalKnowledgeCitation = {
        id: 'general_knowledge',
        title: 'General Knowledge',
        url: null,
        sourceType: 'general_knowledge',
        distance: undefined,
        snippet: 'Answer provided from general knowledge about fitness, wellness, and lifestyle topics.',
      };

      return {
        answer,
        sessionId,
        citations: [generalKnowledgeCitation], // Show citation for general knowledge answers
        rawSources: [],
      } satisfies AssistantResponse;
    } catch (error: any) {
      console.error('[assistant.chatAsk] error', error);
      const msg = (error?.message || '').toString();
      const requestData = (request.data as AssistantRequest) || {};
      // Friendly fallback if vector search/index isn't ready yet
      if (msg.includes('findNearest') || msg.includes('FAILED_PRECONDITION') || msg.includes('index')) {
        return {
          answer: 'I don\'t have access to the knowledge base yet. Please try again shortly while we finish indexing our content.',
          sessionId: requestData.sessionId || uuidv4(),
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
    let text = (request.data?.text || '').toString().trim();
    if (!text) {
      throw new HttpsError('invalid-argument', 'text is required');
    }

    // Log text details for debugging
    console.log(`[assistant.synthesizeSpeech] Text length: ${text.length} chars`);
    console.log(`[assistant.synthesizeSpeech] Text (first 200 chars): ${text.slice(0, 200)}`);
    console.log(`[assistant.synthesizeSpeech] Text (last 200 chars): ${text.slice(-200)}`);
    
    // Google TTS has a limit of 5000 characters per request
    if (text.length > 5000) {
      console.warn(`[assistant.synthesizeSpeech] Text exceeds 5000 char limit (${text.length} chars), truncating`);
      // Truncate to 5000 chars, but try to end at a sentence boundary
      let truncated = text.slice(0, 5000);
      const lastPeriod = truncated.lastIndexOf('.');
      const lastQuestion = truncated.lastIndexOf('?');
      const lastExclamation = truncated.lastIndexOf('!');
      const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
      if (lastSentenceEnd > 4800) {
        // If we can find a sentence end close to the limit, use it
        truncated = truncated.slice(0, lastSentenceEnd + 1);
      }
      console.log(`[assistant.synthesizeSpeech] Truncated to ${truncated.length} chars (ended at: "${truncated.slice(-50)}")`);
      text = truncated;
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
      console.log(`[assistant.synthesizeSpeech] Audio generated: ${audioContent.length} bytes (base64)`);
      return { audioContent };
    } catch (error: any) {
      console.error('[assistant.synthesizeSpeech] error', error);
      console.error('[assistant.synthesizeSpeech] Text that caused error (first 500 chars):', text.slice(0, 500));
      throw new HttpsError('internal', error?.message || 'Failed to synthesize speech');
    }
  }
);

