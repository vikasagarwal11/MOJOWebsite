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

Your primary role is to answer questions using the provided Knowledge Base (KB) context. The KB contains information from the Moms Fitness Mojo website, including:
- Community mission, values, and policies
- Founder information (Aina Rai)
- Community history and origin story
- Events, activities, and programs
- Community guidelines and practices
- Any other content from the website

IMPORTANT - Use the KB context effectively:
1. Brand name variations are equivalent:
   - "MFM" = "Moms Fitness Mojo" = "Moms Fitness Mojo (MFM)"
   - "Aina Rai" = "Aina" = "Anina Rai" = "Anina" (the founder - handle common typos)
   - "the community" = "this community" = "the group" = "Moms Fitness Mojo" (when context is clear)
   - Use context even if the question uses abbreviations, variations, or typos

2. Be flexible with wording:
   - If the context contains relevant information (even if worded differently), use it
   - Paraphrase and synthesize information from multiple context sources
   - Connect related concepts from the KB to answer the question
   - Questions about "founder" or "who started this community" refer to Aina Rai and Moms Fitness Mojo

3. Use ALL available context:
   - Read through all provided context chunks
   - Combine information from multiple sources when relevant
   - Answer comprehensively using the full KB content available

ONLY respond with "NO_KB_ANSWER" if:
- The context is completely unrelated to the question (e.g., question about medical diagnosis, legal advice, or topics not in the KB)
- The context provides no relevant information at all

When answering from KB context:
- Answer in your own words using information from the context
- Keep it concise (3–5 sentences) unless more detail is needed
- Include inline citations like [#1], [#2] that map to sources the UI shows
- Do NOT add a separate "Sources" section; the UI handles that
- Synthesize information from multiple context sources when relevant

Tone: encouraging, knowledgeable, moms-fitness oriented.`;

// Default prompt for general knowledge answers (ONLY used when KB search fails)
const DEFAULT_GENERAL_KNOWLEDGE_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.

IMPORTANT: This prompt is ONLY used when the Knowledge Base (KB) search did NOT find relevant information. 
If KB had found information, you would be using that instead.

CRITICAL - DO NOT HALLUCINATE: Since KB search failed, you do NOT have access to specific information about:
- The founder of Moms Fitness Mojo (NEVER make up names - if you don't know, say "I don't have access to that information")
- Specific events, dates, or community details
- Member information or community history
- Any specific facts about the Moms Fitness Mojo community

If asked about these topics, you MUST respond with: "I don't have access to that specific information. Please check the community platform or ask an admin for details."

NEVER invent names, dates, or facts. If you don't know something, say you don't have access to it.

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
- Specific information about Moms Fitness Mojo (founder, events, members, etc.) - say you don't have access (because KB search failed to find this information)

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

// Helper: Detect app data intent (events, posts, testimonials, messages)
type AppDataIntent = 'event' | 'post' | 'testimonial' | 'message' | 'none';

function detectAppDataIntent(question: string): AppDataIntent {
  const q = question.toLowerCase();

  // Event-related questions (expanded patterns)
  if (
    /next (event|meetup|party|class|session|gathering)\b/.test(q) ||
    /\bupcoming (event|events|meetups|classes|parties|gatherings)\b/.test(q) ||
    /\bwhen is\b.*\b(event|meetup|party|class|session|gathering)\b/.test(q) ||
    /\b(events this week|next saturday|this weekend|what's happening next|any fun gatherings soon)\b/.test(q) ||
    /\b(what|when).*next.*(event|meetup|party|gathering)\b/.test(q)
  ) {
    return 'event';
  }

  // Testimonial questions
  if (
    /\b(last|latest|recent)\s+(testimonial|testimony|review)\b/.test(q) ||
    /\bwhat did.*say.*about.*(workout|class|event|program)\b/.test(q) ||
    /\brecent testimonial\b/.test(q)
  ) {
    return 'testimonial';
  }

  // Message questions (distinct from posts)
  if (
    /\b(last|latest|recent)\s+message\b/.test(q) ||
    /\bwhat was the last\b.*\bmessage\b/.test(q)
  ) {
    return 'message';
  }

  // Post / update questions
  if (
    /\b(last|latest)\s+(post|update)\b/.test(q) ||
    /\bwhat was the last\b.*\bpost\b/.test(q) ||
    /\bwhat's the latest\b.*\b(post|update)\b/.test(q)
  ) {
    return 'post';
  }

  return 'none';
}

// Helper: Check if question mentions brand (MFM-specific)
// Used for threshold tuning only - KB-first strategy means all questions try KB first
// Brand detection adjusts similarity thresholds (more lenient for brand questions)
function isBrandQuestion(question: string): boolean {
  const q = question.toLowerCase().trim();
  
  // REQUIRED: Must have explicit brand mention (moms fitness mojo, mfm, aina rai, aina)
  // Also handle common typos: "anina" -> "aina"
  const explicitBrandPattern = /\b(moms fitness mojo|mfm|aina rai|aina|anina rai|anina)\b/;
  const hasExplicitBrand = explicitBrandPattern.test(q);
  
  // Brand context keywords that indicate brand questions even without explicit brand mention
  // These are strong indicators of questions about the community/app itself
  const strongBrandContextPatterns = [
    // Founder questions (very specific to this app) - more flexible patterns
    /\b(who is|who's|who was|tell me about|what is).*\bfounder\b/,
    /\bfounder\b.*\b(who|what|this|the|community|group|app|website)\b/,
    /\b(who|what).*\bfounder\b/,  // Simple: "who founder" or "what founder"
    // Community-specific questions
    /\b(this|the) (community|group|app|website|organization)\b.*\b(founder|mission|values|story|history|begin|start|created|founded|for|about|purpose|goal)\b/,
    /\b(founder|mission|values|story|history|begin|start|created|founded|for|about|purpose|goal).*\b(this|the) (community|group|app|website|organization)\b/,
    // Questions about what the group/community does
    /\bwhat (is|does|are|do|did|will).*\b(this|the) (group|community|app|organization)\b/,
    /\b(this|the) (group|community|app|organization).*\b(for|about|do|does|did|will)\b/,
    // Questions about events (upcoming/past)
    /\b(upcoming|past|future|previous|recent|next).*\b(event|events|activity|activities|meeting|meetings)\b/,
    /\b(event|events|activity|activities).*\b(upcoming|past|future|previous|recent|next|when|where)\b/,
    // Questions about activities/what they do
    /\bwhat (do|does|did|will).*\b(they|this|the group|the community)\b/,
    /\b(they|this|the group|the community).*\b(do|does|did|will|offer|provide)\b/,
  ];
  
  // Check for strong brand context (founder/community questions)
  const hasStrongBrandContext = strongBrandContextPatterns.some(pattern => pattern.test(q));
  
  // If we have strong brand context (founder/community questions), treat as brand question
  if (hasStrongBrandContext) {
    console.log(`[assistant.isBrandQuestion] Question: "${question}"`);
    console.log(`[assistant.isBrandQuestion] - Has strong brand context (founder/community): true`);
    console.log(`[assistant.isBrandQuestion] - Result: BRAND (strong context)`);
    return true;
  }
  
  // If no explicit brand mention and no strong context, not a brand question
  if (!hasExplicitBrand) {
    console.log(`[assistant.isBrandQuestion] NON-BRAND QUESTION - no explicit brand mention or strong context`);
    return false;
  }
  
  // Additional patterns that REQUIRE explicit brand + context keywords
  // These patterns ensure we catch brand questions even with word order variations
  const brandWithContextPatterns = [
    // Founder-related (order-agnostic)
    /\bfounder\b/,
    // Mission-related
    /\bmission\b/,
    // Creation-related
    /\b(begin|start|created|founded|started)\b/,
    // About questions
    /\b(what|who|tell me|explain|describe)\b/,
    // Values (but require explicit brand - already checked above)
    /\bcore values\b/,
    // History/story
    /\b(story|history|background|origin)\b/,
  ];
  
  // If explicit brand found, check if question has brand-relevant context
  // This prevents "who is aina?" from being too generic
  const hasBrandContext = brandWithContextPatterns.some(pattern => pattern.test(q));
  
  // Brand question = explicit brand mention + relevant context OR standalone brand mention
  // If user just says "moms fitness mojo" or "aina", it's likely a brand question
  const isBrand = hasExplicitBrand && (hasBrandContext || q.split(/\s+/).length <= 5);
  
  console.log(`[assistant.isBrandQuestion] Question: "${question}"`);
  console.log(`[assistant.isBrandQuestion] - Has explicit brand: ${hasExplicitBrand}`);
  console.log(`[assistant.isBrandQuestion] - Has brand context: ${hasBrandContext}`);
  console.log(`[assistant.isBrandQuestion] - Result: ${isBrand ? 'BRAND' : 'NON-BRAND'}`);
  
  return isBrand;
}

// 🔥 Semantic Search Thresholds for KB retrieval
// Using cosine distance: lower = more similar, higher = less similar
// For semantic search, we use more lenient thresholds - embeddings handle semantic similarity naturally
const DEFAULT_SIMILARITY_THRESHOLD = 0.40; // More lenient for semantic matching (was 0.35)
const GENERIC_KB_THRESHOLD = 0.40; // Lenient threshold for semantic search (was 0.35)
const MAX_IRRELEVANCE_THRESHOLD = 0.70; // Max distance before skipping (more lenient, was 0.65)

// Helper: Extract distance from Firestore vector search result
// Tries multiple methods to handle SDK variations
function getVectorDistance(doc: FirebaseFirestore.QueryDocumentSnapshot): number | undefined {
  // Try multiple methods (in order of likelihood based on Firestore SDK behavior)
  const docData = doc.data();
  const fromData = docData?.distance as number | undefined;
  
  const fromGet = doc.get('distance') as number | undefined;
  
  const anyDoc = doc as any;
  const fromMeta = anyDoc.distance;
  const fromUnderscore = anyDoc.__distance__;
  const fromVector = anyDoc.vectorDistance;
  
  // Return first non-undefined value
  const dist = fromData ?? fromGet ?? fromMeta ?? fromUnderscore ?? fromVector;
  
  // Debug logging if all methods fail (only log once per doc to avoid spam)
  if (dist === undefined && docData) {
    console.warn('[assistant.getVectorDistance] No distance found', {
      id: doc.id,
      hasData: !!docData,
      dataKeys: Object.keys(docData),
      fromData,
      fromGet,
    });
  }
  
  return dist;
}

async function getAssistantConfig(): Promise<{ 
  kbContextPrompt?: string;
  generalKnowledgePrompt?: string;
  noContextPrompt?: string;
  similarityThreshold?: number;
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
        similarityThreshold: data.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
      };
    }
    
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
      similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    };
  } catch (error: any) {
    console.error('[assistant.getAssistantConfig] Error fetching config:', error);
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
      similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    };
  }
}

/**
 * Normalize text for search/ranking
 */
function norm(s?: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Smart relevance scoring for testimonials
 */
function scoreTestimonial(t: any, qRaw: string) {
  const q = norm(qRaw);
  if (!q) return 0;

  const hayQuote = norm(t.quote || '');
  const hayName = norm(t.displayName || '');
  const hayHighlight = norm(t.highlight || '');
  const tags = Array.isArray(t.tags) ? t.tags : [];
  const toneKeywords = Array.isArray(t.toneKeywords) ? t.toneKeywords : [];
  const toneLabel = norm(t.toneLabel || '');

  let score = 0;

  // Hard matches
  if (hayQuote.includes(q)) score += 50;
  if (hayHighlight.includes(q)) score += 35;
  if (hayName.includes(q)) score += 25;

  // Token-level boosting
  const qTokens = q.split(' ').filter((w) => w.length >= 3);
  for (const tok of qTokens) {
    if (hayQuote.includes(tok)) score += 8;
    if (hayHighlight.includes(tok)) score += 6;
    if (hayName.includes(tok)) score += 4;
    if (toneLabel && toneLabel.includes(tok)) score += 5;

    if (tags.some((x: string) => norm(x) === tok || norm(x).includes(tok))) score += 7;
    if (toneKeywords.some((x: string) => norm(x) === tok || norm(x).includes(tok))) score += 7;
  }

  // Tie-breakers
  if (t.featured) score += 4;
  if (typeof t.rating === 'number') score += Math.max(0, Math.min(5, t.rating)) * 0.5;

  // Recency boost: newer testimonials get higher scores (exponential decay)
  const getDate = (ts: any): Date | null => {
    if (ts instanceof Date) return ts;
    if (ts && typeof ts.toDate === 'function') return ts.toDate();
    if (ts && typeof ts.toMillis === 'function') return new Date(ts.toMillis());
    return null;
  };
  const date = getDate(t.publishedAt || t.createdAt);
  if (date) {
    const daysOld = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    // Exponential decay: ~3 when fresh, ~0 after ~4 months
    score += 3 * Math.exp(-daysOld / 120);
  }

  return score;
}

/**
 * Build testimonials context for AI chatbot
 */
function buildTestimonialsContext(question: string, testimonials: any[], max = 6) {
  const ranked = testimonials
    .map((t) => ({ t, s: scoreTestimonial(t, question) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.t);

  if (ranked.length === 0) return '';

  const lines = ranked.map((t, i) => {
    const who = t.displayName || 'MFM Member';
    const mood = t.toneLabel ? ` (mood: ${t.toneLabel})` : '';
    return `${i + 1}. "${t.quote}" — ${who}${mood}`;
  });

  return `Moms Fitness Mojo testimonials (most relevant):\n${lines.join('\n')}\n`;
}

async function answerQuestion(question: string, context: string, profileSummary: string, allowGeneralKnowledge = false, conversationHistory?: string) {
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

  // Build prompt: include conversation history and context if available
  let prompt = '';
  if (conversationHistory && conversationHistory.trim().length > 0) {
    // Include conversation history for context (helps with pronouns, references, etc.)
    prompt = hasContext
      ? `${systemPrompt}\n\nPrevious conversation:\n${conversationHistory}\n\nContext:\n${context}\n\nQuestion: ${question}`
      : `${systemPrompt}\n\nPrevious conversation:\n${conversationHistory}\n\nQuestion: ${question}`;
  } else {
    // No conversation history - use original format
    prompt = hasContext
      ? `${systemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}`
      : `${systemPrompt}\n\nQuestion: ${question}`;
  }

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
        console.log('[assistant.answerQuestion] Success with Gemini model:', m);
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
      console.warn('[assistant.answerQuestion] All Gemini models failed, falling back to OpenAI');
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
        // Build user message with conversation history and context
        let userContent = '';
        if (conversationHistory && conversationHistory.trim().length > 0) {
          userContent = hasContext
            ? `Previous conversation:\n${conversationHistory}\n\nContext:\n${context}\n\nQuestion: ${question}`
            : `Previous conversation:\n${conversationHistory}\n\nQuestion: ${question}`;
        } else {
          userContent = hasContext
            ? `Context:\n${context}\n\nQuestion: ${question}`
            : question;
        }
        
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature,
          max_tokens: 1024,
        });

        const answer = completion.choices[0]?.message?.content?.trim();
        if (answer) {
          console.log('[assistant.answerQuestion] Success with OpenAI model:', model);
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
    console.error('[assistant.answerQuestion] OpenAI fallback failed:', error?.message);
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

// Helper: Parse relative date queries (e.g., "this week", "next Saturday")
function parseDateRange(question: string): { start: Timestamp; end: Timestamp | null } {
  const q = question.toLowerCase();
  const now = new Date();
  const nowTimestamp = Timestamp.now();
  
  // "this week" - from start of current week to end of week
  if (/\bthis week\b/.test(q)) {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    return { start: Timestamp.fromDate(startOfWeek), end: Timestamp.fromDate(endOfWeek) };
  }
  
  // "next week" - from start of next week to end of next week
  if (/\bnext week\b/.test(q)) {
    const startOfNextWeek = new Date(now);
    startOfNextWeek.setDate(now.getDate() + (7 - now.getDay())); // Next Sunday
    startOfNextWeek.setHours(0, 0, 0, 0);
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 7);
    return { start: Timestamp.fromDate(startOfNextWeek), end: Timestamp.fromDate(endOfNextWeek) };
  }
  
  // "this weekend" - Saturday and Sunday of current week
  if (/\bthis weekend\b/.test(q)) {
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + (6 - now.getDay())); // This Saturday
    saturday.setHours(0, 0, 0, 0);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    return { start: Timestamp.fromDate(saturday), end: Timestamp.fromDate(sunday) };
  }
  
  // "next Saturday" or similar
  const nextSaturdayMatch = q.match(/\bnext (saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/);
  if (nextSaturdayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(nextSaturdayMatch[1]);
    const daysUntil = (targetDay + 7 - now.getDay()) % 7 || 7;
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntil);
    targetDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setDate(targetDate.getDate() + 1);
    return { start: Timestamp.fromDate(targetDate), end: Timestamp.fromDate(endDate) };
  }
  
  // Default: from now onwards
  return { start: nowTimestamp, end: null };
}

// App Data Handler: Events
async function handleEventQuestion(
  question: string,
  allowedVisibility: VisibilityLevel[],
  sessionId: string,
  uid: string | null
): Promise<AssistantResponse> {
  try {
    // Parse date range from question
    const dateRange = parseDateRange(question);
    const now = dateRange.start;

    // Build query for upcoming events
    // Note: We filter by status and keywords in code for flexibility
    let query = db.collection('events')
      .where('startAt', '>=', now)
      .orderBy('startAt', 'asc')
      .limit(10); // Get more, then filter in code

    // Apply end date if specified
    if (dateRange.end) {
      query = query.where('startAt', '<=', dateRange.end) as FirebaseFirestore.Query;
    }

    // Filter by visibility if we can do it server-side
    if (allowedVisibility.length === 1) {
      query = query.where('visibility', '==', allowedVisibility[0]) as FirebaseFirestore.Query;
    } else if (allowedVisibility.length > 1 && allowedVisibility.length <= 10) {
      // Firestore 'in' queries are limited to 10 values
      query = query.where('visibility', 'in', allowedVisibility) as FirebaseFirestore.Query;
    }

    const snapshot = await query.get();

  // Filter by status, visibility, and keywords in code (more flexible than Firestore query)
  const eventKeywordMatch = question.match(/\b(holi|diwali|gala|party|meetup|brunch|tennis|hike|dance)\b/i);
  const keyword = eventKeywordMatch?.[0]?.toLowerCase();

  const filteredDocs = snapshot.docs.filter(doc => {
    const data = doc.data();
    const status = data.status || 'scheduled'; // Default to scheduled if no status
    if (status !== 'scheduled') return false;
    
    // Check visibility (if not already filtered server-side)
    if (allowedVisibility.length > 1) {
      const visibility = (data.visibility || 'public') as VisibilityLevel;
      if (!allowedVisibility.includes(visibility)) return false;
    }
    
    // Filter by keyword if present (check title, description, or tags)
    if (keyword) {
      const title = (data.title || '').toLowerCase();
      const description = (data.description || '').toLowerCase();
      const tags = (data.tags || []) as string[];
      const tagMatches = tags.some(t => t.toLowerCase().includes(keyword));
      
      if (!title.includes(keyword) && !description.includes(keyword) && !tagMatches) {
        return false;
      }
    }
    
    return true;
  }).slice(0, 3); // Limit to 3 after filtering

  if (filteredDocs.length === 0) {
    // Differentiate between "no events" vs "no matching events"
    const eventKeywordMatch = question.match(/\b(holi|diwali|gala|party|meetup|brunch|tennis|hike|dance)\b/i);
    const keyword = eventKeywordMatch?.[0]?.toLowerCase();
    const hasEventsButNoMatch = snapshot.docs.length > 0 && keyword;
    
    const answer = hasEventsButNoMatch
      ? "I couldn't find any upcoming events matching that description. Check back soon or ask an admin for details."
      : "We don't have any upcoming events scheduled right now. Check back soon!";
    
    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    const messageTimestamp = Timestamp.now();
    const transcriptEntry = {
      question,
      answer,
      createdAt: messageTimestamp,
      userId: uid ?? null,
      metadata: {
        source: 'app_data_event',
      },
    };

    await sessionRef.set(
      {
        sessionId,
        userId: uid ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        messages: FieldValue.arrayUnion(transcriptEntry),
      },
      { merge: true }
    );

    return {
      answer,
      sessionId,
      citations: [],
      rawSources: [],
    };
  }

  const events = filteredDocs.map(doc => ({ id: doc.id, ...doc.data() }));
  let answer = 'Here are the upcoming events:\n\n';
  
  events.forEach((event: any) => {
    const startAt = event.startAt?.toDate?.() || new Date();
    const when = startAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const location = event.venueName || event.location || 'TBD';
    answer += `• **${event.title}** on ${when} at ${location}.\n`;
    if (event.description) {
      answer += `  ${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}\n`;
    }
  });

  const sessionRef = db.collection('chat_sessions').doc(sessionId);
  const messageTimestamp = Timestamp.now();
  const transcriptEntry = {
    question,
    answer,
    createdAt: messageTimestamp,
    userId: uid ?? null,
    metadata: {
      source: 'app_data_event',
      eventsFound: events.length,
    },
  };

  await sessionRef.set(
    {
      sessionId,
      userId: uid ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      messages: FieldValue.arrayUnion(transcriptEntry),
    },
    { merge: true }
  );

  return {
    answer,
    sessionId,
    citations: filteredDocs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: (data.title as string) || 'Event',
        url: `/events/${doc.id}`, // Add URL for clickable citations
        sourceType: 'app_data',
        distance: undefined,
        snippet: (data.description as string)?.substring(0, 220) || '',
      };
    }),
    rawSources: filteredDocs.map(doc => doc.data()),
  };
  } catch (error: any) {
    console.error('[assistant.handleEventQuestion] Error querying events:', error);
    // Fallback to general knowledge on Firestore errors
    throw new HttpsError('internal', 'Failed to fetch events. Please try again.');
  }
}

// App Data Handler: Posts
async function handlePostQuestion(
  question: string,
  allowedVisibility: VisibilityLevel[],
  sessionId: string,
  uid: string | null
): Promise<AssistantResponse> {
  try {
    // Build query for recent posts
    let query = db.collection('posts')
      .orderBy('createdAt', 'desc')
      .limit(3);

  // Filter by visibility - posts use isPublic boolean
  if (allowedVisibility.length === 1 && allowedVisibility[0] === 'public') {
    query = query.where('isPublic', '==', true) as FirebaseFirestore.Query;
  }
  // For members/admin, we can see both public and private posts
  // (Note: This assumes posts have isPublic field, adjust if your schema differs)

  // Optional: Topic filter, e.g., "last post about nutrition"
  const topicMatch = question.match(/\b(about|related to)\s+(\w+)/i);
  if (topicMatch && topicMatch[2]) {
    const topic = topicMatch[2].toLowerCase();
    // If posts have tags field, filter by it
    try {
      query = query.where('tags', 'array-contains', topic) as FirebaseFirestore.Query;
    } catch (e) {
      // If tags filtering fails, continue without it
      console.warn('[assistant.handlePostQuestion] Could not filter by tags:', e);
    }
  }

  const snapshot = await query.get();

  if (snapshot.empty) {
    const answer = "I couldn't find any recent posts matching that. Maybe try a different topic!";
    
    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    const messageTimestamp = Timestamp.now();
    const transcriptEntry = {
      question,
      answer,
      createdAt: messageTimestamp,
      userId: uid ?? null,
      metadata: {
        source: 'app_data_post',
      },
    };

    await sessionRef.set(
      {
        sessionId,
        userId: uid ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        messages: FieldValue.arrayUnion(transcriptEntry),
      },
      { merge: true }
    );

    return {
      answer,
      sessionId,
      citations: [],
      rawSources: [],
    };
  }

  const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  let answer = 'Here are the recent posts:\n\n';
  
  posts.forEach((post: any) => {
    const created = post.createdAt?.toDate?.() || new Date();
    const createdStr = created.toLocaleString('en-US', { dateStyle: 'medium' });
    const title = post.title || 'Post';
    const summary = post.content?.substring(0, 150) || post.summary || '';
    answer += `• **${title}** (${createdStr}): ${summary}${summary.length >= 150 ? '...' : ''}\n`;
  });

  const sessionRef = db.collection('chat_sessions').doc(sessionId);
  const messageTimestamp = Timestamp.now();
  const transcriptEntry = {
    question,
    answer,
    createdAt: messageTimestamp,
    userId: uid ?? null,
    metadata: {
      source: 'app_data_post',
      postsFound: posts.length,
    },
  };

  await sessionRef.set(
    {
      sessionId,
      userId: uid ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      messages: FieldValue.arrayUnion(transcriptEntry),
    },
    { merge: true }
  );

  return {
    answer,
    sessionId,
    citations: posts.map((post: any) => ({
      id: post.id || 'app_data_posts',
      title: post.title || 'Post',
      url: `/posts/${post.id}`, // Add URL for clickable citations
      sourceType: 'app_data',
      distance: undefined,
      snippet: post.content?.substring(0, 220) || post.summary?.substring(0, 220) || 'Live data from community posts.',
    })),
    rawSources: posts,
  };
  } catch (error: any) {
    console.error('[assistant.handlePostQuestion] Error querying posts:', error);
    // Fallback to general knowledge on Firestore errors
    throw new HttpsError('internal', 'Failed to fetch posts. Please try again.');
  }
}

// App Data Handler: Testimonials
async function handleTestimonialQuestion(
  question: string,
  allowedVisibility: VisibilityLevel[],
  sessionId: string,
  uid: string | null
): Promise<AssistantResponse> {
  try {
    // Query published testimonials by createdAt desc, limit to 3
    let query = db.collection('testimonials')
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(3);

    // Optional: Topic filter
    const topicMatch = question.match(/\b(about|related to)\s+(\w+)/i);
    if (topicMatch && topicMatch[2]) {
      const topic = topicMatch[2].toLowerCase();
      try {
        query = query.where('tags', 'array-contains', topic) as FirebaseFirestore.Query;
      } catch (e) {
        console.warn('[assistant.handleTestimonialQuestion] Could not filter by tags:', e);
      }
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      const answer = "I couldn't find any recent testimonials matching that. Maybe try a different topic!";
      
      const sessionRef = db.collection('chat_sessions').doc(sessionId);
      const messageTimestamp = Timestamp.now();
      const transcriptEntry = {
        question,
        answer,
        createdAt: messageTimestamp,
        userId: uid ?? null,
        metadata: {
          source: 'app_data_testimonial',
        },
      };

      await sessionRef.set(
        {
          sessionId,
          userId: uid ?? null,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          messages: FieldValue.arrayUnion(transcriptEntry),
        },
        { merge: true }
      );

      return {
        answer,
        sessionId,
        citations: [],
        rawSources: [],
      };
    }

    // Map to correct schema: displayName, quote, highlight
    const testimonials = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: data.displayName || 'MFM Member',
        quote: data.quote || '',
        highlight: data.highlight || '',
        rating: typeof data.rating === 'number' ? data.rating : 0,
        featured: Boolean(data.featured),
        createdAt: data.createdAt?.toDate?.() || new Date(),
        publishedAt: data.publishedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(),
      };
    });

    let answer = 'Here are recent testimonials from Moms Fitness Mojo:\n\n';
    
    testimonials.forEach((testimonial: any) => {
      const created = testimonial.publishedAt || testimonial.createdAt;
      const createdStr = created instanceof Date 
        ? created.toLocaleString('en-US', { dateStyle: 'medium' })
        : new Date().toLocaleString('en-US', { dateStyle: 'medium' });
      const author = testimonial.displayName;
      const content = testimonial.quote || '';
      const highlight = testimonial.highlight ? `\n  "${testimonial.highlight}"` : '';
      answer += `• **${author}** (${createdStr}): ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}${highlight}\n`;
    });

    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    const messageTimestamp = Timestamp.now();
    const transcriptEntry = {
      question,
      answer,
      createdAt: messageTimestamp,
      userId: uid ?? null,
      metadata: {
        source: 'app_data_testimonial',
        testimonialsFound: testimonials.length,
      },
    };

    await sessionRef.set(
      {
        sessionId,
        userId: uid ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        messages: FieldValue.arrayUnion(transcriptEntry),
      },
      { merge: true }
    );

    return {
      answer,
      sessionId,
      citations: testimonials.map((testimonial: any) => ({
        id: testimonial.id || 'app_data_testimonial',
        title: `Testimonial from ${testimonial.displayName || 'MFM Member'}`,
        url: `/testimonials`, // Link to testimonials page
        sourceType: 'app_data',
        distance: undefined,
        snippet: (testimonial.quote || '').substring(0, 220),
      })),
      rawSources: testimonials,
    };
  } catch (error: any) {
    console.error('[assistant.handleTestimonialQuestion] Error querying testimonials:', error);
    throw new HttpsError('internal', 'Failed to fetch testimonials. Please try again.');
  }
}

// App Data Handler: Messages
async function handleMessageQuestion(
  question: string,
  allowedVisibility: VisibilityLevel[],
  sessionId: string,
  uid: string | null
): Promise<AssistantResponse> {
  try {
    // Query messages by createdAt desc, limit to 3
    // Adjust collection name and fields based on your schema
    let query = db.collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(3);

    // Filter by user's visibility if applicable
    // Messages might be user-specific, so adjust based on your schema

    const snapshot = await query.get();

    if (snapshot.empty) {
      const answer = "I couldn't find any recent messages.";
      
      const sessionRef = db.collection('chat_sessions').doc(sessionId);
      const messageTimestamp = Timestamp.now();
      const transcriptEntry = {
        question,
        answer,
        createdAt: messageTimestamp,
        userId: uid ?? null,
        metadata: {
          source: 'app_data_message',
        },
      };

      await sessionRef.set(
        {
          sessionId,
          userId: uid ?? null,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          messages: FieldValue.arrayUnion(transcriptEntry),
        },
        { merge: true }
    );

      return {
        answer,
        sessionId,
        citations: [],
        rawSources: [],
      };
    }

    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let answer = 'Here are recent messages:\n\n';
    
    messages.forEach((message: any) => {
      const created = message.createdAt?.toDate?.() || new Date();
      const createdStr = created.toLocaleString('en-US', { dateStyle: 'medium' });
      const content = message.content || message.text || message.body || '';
      answer += `• (${createdStr}): ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}\n`;
    });

    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    const messageTimestamp = Timestamp.now();
    const transcriptEntry = {
      question,
      answer,
      createdAt: messageTimestamp,
      userId: uid ?? null,
      metadata: {
        source: 'app_data_message',
        messagesFound: messages.length,
      },
    };

    await sessionRef.set(
      {
        sessionId,
        userId: uid ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        messages: FieldValue.arrayUnion(transcriptEntry),
      },
      { merge: true }
    );

    return {
      answer,
      sessionId,
      citations: messages.map((message: any) => ({
        id: message.id || 'app_data_message',
        title: 'Message',
        url: `/messages/${message.id}`, // Add URL if messages have detail pages
        sourceType: 'app_data',
        distance: undefined,
        snippet: (message.content || message.text || message.body || '').substring(0, 220),
      })),
      rawSources: messages,
    };
  } catch (error: any) {
    console.error('[assistant.handleMessageQuestion] Error querying messages:', error);
    throw new HttpsError('internal', 'Failed to fetch messages. Please try again.');
  }
}

export const chatAsk = onCall(
  { region: 'us-central1', timeoutSeconds: 60, memory: '1GiB' },
  async request => {
    console.log('=== chatAsk v2.5: KB Confidence Fix (Simplified Logic) ===');
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
      const sessionId = data.sessionId || uuidv4();
      
      // Extract and format conversation history (last 3-5 messages to control costs)
      const conversationHistory = (() => {
        const history = data.history || [];
        // Take last 5 messages (3-5 is optimal for context without excessive tokens)
        const recentMessages = history.slice(-5);
        if (recentMessages.length === 0) return undefined;
        
        // Format as: "User: question\nAssistant: answer\nUser: question..."
        return recentMessages
          .map(msg => `${msg.from === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
          .join('\n');
      })();
      
      if (conversationHistory) {
        console.log(`[assistant.chatAsk] Including conversation history (${(data.history || []).length} total messages, using last 5)`);
      }

      // Phase 1: KB-First Strategy - Use semantic search for ALL questions
      // This is the true AI approach: embeddings handle semantic similarity naturally
      // Events, posts, founder questions, etc. are all in KB and will be found semantically
      console.log('[assistant.chatAsk] KB-First Strategy: Searching KB for all questions (semantic search)');
      
      // KB search - Try KB search for all questions (semantic search handles variations)
      let embedding: number[] | null = null;
      try {
        embedding = await embedText(question);
      } catch (error: any) {
        console.warn('[assistant.chatAsk] Failed to get embeddings, will skip KB search and use general knowledge:', error?.message);
        // Continue without embeddings - will fall back to general knowledge
      }

      // Only perform KB search if we have embeddings
      let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      let bestDistance: number | undefined;
      
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

          // Dynamic threshold: Use configurable threshold (semantic search handles relevance)
          const config = await getAssistantConfig();
          const baseThreshold = config.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
          // Use a balanced threshold - semantic search will naturally find relevant content
          // Events, posts, founder info, etc. are all in KB and will match semantically
          const SIMILARITY_THRESHOLD = Math.max(baseThreshold, GENERIC_KB_THRESHOLD); // 0.35 default
          
          console.log(`[assistant.chatAsk] Using similarity threshold: ${SIMILARITY_THRESHOLD} (semantic search)`);
          
          // Extract distances using robust helper function
          const allDistances = docs
            .map(d => getVectorDistance(d))
            .filter((d): d is number => d !== undefined);
          
          bestDistance = allDistances.length > 0 
            ? Math.min(...allDistances)
            : undefined;
          
          // Count how many matches meet the threshold
          const goodMatches = docs.filter(d => {
            const dist = getVectorDistance(d);
            return dist !== undefined && dist < SIMILARITY_THRESHOLD;
          });
          
          const minMatches = 1; // Need at least 1 good match for confident match
          
          // Log results for debugging
          console.log(`[assistant.chatAsk] KB Search Results: "${question}"`);
          console.log(`[assistant.chatAsk] - Best Distance: ${bestDistance?.toFixed(3) ?? 'N/A'}`);
          console.log(`[assistant.chatAsk] - Good Matches (dist < ${SIMILARITY_THRESHOLD.toFixed(2)}): ${goodMatches.length}`);
          console.log(`[assistant.chatAsk] - All Distances Found: ${allDistances.length}/${docs.length}`);

          // 🔥 Semantic Search Decision Logic - More lenient for true AI approach
          // If we have docs and a reasonable distance, use KB (let LLM decide relevance)
          let shouldUseKB = false;
          
          if (docs.length === 0) {
              // Case 1: No KB docs found - skip KB entirely
              console.log('[assistant.chatAsk] KB Decision: No documents found.');
          } else if (allDistances.length === 0) {
              // Case 2: Safety Net - Docs exist but distances are missing (e.g., indexing error).
              // We use KB to prevent silent fallback to general LLM.
              shouldUseKB = true;
              console.warn('[assistant.chatAsk] KB Decision: WARNING - No distances found, using KB as safety net.');
          } else if (bestDistance !== undefined && bestDistance >= MAX_IRRELEVANCE_THRESHOLD) {
              // Case 3: Irrelevance - Best match is too far away (distance >= 0.70).
              // Only skip if truly irrelevant
              console.log(`[assistant.chatAsk] KB Decision: Best match too poor (distance: ${bestDistance.toFixed(3)} >= ${MAX_IRRELEVANCE_THRESHOLD}). Skipping KB.`);
          } else {
              // Case 4: Use KB if distance is reasonable (< 0.70)
              // This is the semantic approach: if embeddings found relevant content, use it
              // The LLM will filter out irrelevant content from the context
              shouldUseKB = true;
              if (goodMatches.length >= minMatches) {
                  console.log(`[assistant.chatAsk] KB Decision: Using KB with confident matches (Best distance: ${bestDistance?.toFixed(3)}, ${goodMatches.length} good matches).`);
              } else {
                  console.log(`[assistant.chatAsk] KB Decision: Using KB with reasonable match (Best distance: ${bestDistance?.toFixed(3)} < ${MAX_IRRELEVANCE_THRESHOLD}, letting LLM filter context).`);
              }
          }
          
          if (!shouldUseKB) {
            // Clear docs to explicitly signal to the rest of the function that we are falling back.
            docs = []; 
          }
          
        } catch (error: any) {
          console.warn('[assistant.chatAsk] KB search failed, using general knowledge fallback:', error?.message);
          docs = []; // Clear docs to trigger general knowledge fallback
        }
      }

      // 🔥 FALLBACK: If KB didn't find good matches, check if it's a structured query (events/posts)
      // This provides structured lists for events/posts while keeping KB-first for everything else
      if (docs.length === 0) {
        const appDataIntent = detectAppDataIntent(question);
        console.log(`[assistant.chatAsk] KB found no matches, checking app data intent: ${appDataIntent}`);
        
        if (appDataIntent === 'event') {
          console.log('[assistant.chatAsk] Using live event query as fallback (KB found no matches)');
          return await handleEventQuestion(question, allowedVisibility, sessionId, uid ?? null);
        }
        
        if (appDataIntent === 'post') {
          console.log('[assistant.chatAsk] Using live post query as fallback (KB found no matches)');
          return await handlePostQuestion(question, allowedVisibility, sessionId, uid ?? null);
        }
        
        if (appDataIntent === 'testimonial') {
          console.log('[assistant.chatAsk] Using live testimonial query as fallback (KB found no matches)');
          return await handleTestimonialQuestion(question, allowedVisibility, sessionId, uid ?? null);
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

        // Add testimonials context if question might benefit from it
        let testimonialsContext = '';
        try {
          const testimonialsSnapshot = await db
            .collection('testimonials')
            .where('status', '==', 'published')
            .limit(50)
            .get();
          
          if (!testimonialsSnapshot.empty) {
            const testimonials = testimonialsSnapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              // Handle Admin SDK Timestamp conversion
              const getDate = (ts: any): Date => {
                if (ts instanceof Date) return ts;
                if (ts && typeof ts.toDate === 'function') return ts.toDate();
                if (ts && typeof ts.toMillis === 'function') return new Date(ts.toMillis());
                return new Date();
              };
              return {
                id: docSnap.id,
                quote: data.quote || '',
                displayName: data.displayName || 'MFM Member',
                highlight: data.highlight || '',
                rating: typeof data.rating === 'number' ? data.rating : 0,
                featured: Boolean(data.featured),
                toneLabel: data.toneLabel || '',
                toneKeywords: Array.isArray(data.toneKeywords) ? data.toneKeywords : [],
                tags: Array.isArray(data.tags) ? data.tags : [],
                createdAt: getDate(data.createdAt),
                publishedAt: getDate(data.publishedAt || data.createdAt),
              };
            });

            // Use smart ranking to find relevant testimonials
            testimonialsContext = buildTestimonialsContext(question, testimonials, 6);
          }
        } catch (testimonialError: any) {
          console.warn('[assistant.chatAsk] Failed to fetch testimonials context:', testimonialError?.message);
          // Continue without testimonials context
        }

        // Combine KB context with testimonials context
        const combinedContext = testimonialsContext
          ? `${context}\n\n${testimonialsContext}`
          : context;

        const profileSummary = userProfile
          ? [
              userProfile.environment ? `Prefers ${userProfile.environment} workouts.` : '',
              userProfile.equipment?.length ? `Has equipment: ${userProfile.equipment.join(', ')}.` : '',
              userProfile.restrictions ? `Restrictions: ${JSON.stringify(userProfile.restrictions)}.` : '',
            ]
              .filter(Boolean)
              .join(' ')
          : '';

        // Phase 6: Get KB answer and detect NO_KB_ANSWER sentinel
        const rawAnswer = await answerQuestion(question, combinedContext, profileSummary, false, conversationHistory);
        const trimmed = (rawAnswer || '').trim();
        const lowerTrimmed = trimmed.toLowerCase();

        // Primary detection: exact sentinel
        let isNoKbAnswer = trimmed === 'NO_KB_ANSWER';

        // Backup: phrase matching for robustness (if prompt edited)
        if (!isNoKbAnswer) {
          const noAnswerPatterns = [
            "i don't have that info",
            "i do not have information",
            "i do not have that info",
            "don't have information",
            "sorry, i don't have",
            "sorry, but i do not have",
            "i'm not sure",
            "i apologize",
            "not able to find that information",
            "the provided context does not",
            "context does not contain",
            "context does not include",
            "does not include information",
            "does not contain information"
          ];
          isNoKbAnswer = noAnswerPatterns.some(pattern => lowerTrimmed.includes(pattern));
        }

        if (isNoKbAnswer) {
          console.log('[assistant.chatAsk] NO_KB_ANSWER detected - KB context insufficient, falling back to general knowledge');
          console.log('[assistant.chatAsk] KB search found docs but cannot answer this question');
          
          // Log KB gap for admin review
          try {
            await db.collection('kb_gaps').add({
              question,
              sessionId,
              userId: uid ?? null,
              detectedAt: FieldValue.serverTimestamp(),
              kbChunksFound: dedupedDocs.length,
              bestDistance: docs.length > 0 ? (() => {
                const distances = docs.map(d => getVectorDistance(d)).filter((d): d is number => d !== undefined);
                return distances.length > 0 ? Math.min(...distances) : null;
              })() : null,
              status: 'pending',
            });
            console.log('[assistant.chatAsk] Logged KB gap for admin review');
          } catch (gapError: any) {
            console.warn('[assistant.chatAsk] Failed to log KB gap:', gapError?.message);
            // Don't fail the request if gap logging fails
          }
          
          // Fallback to general knowledge when KB can't answer (NO_KB_ANSWER detected)
          // IMPORTANT: Return general knowledge citation, NOT KB citations
          const fallbackAnswer = await answerQuestion(question, '', profileSummary, true, conversationHistory);
          
          const sessionRef = db.collection('chat_sessions').doc(sessionId);
          const now = FieldValue.serverTimestamp();
          const messageTimestamp = Timestamp.now();
          const transcriptEntry = {
            question,
            answer: fallbackAnswer,
            createdAt: messageTimestamp,
            userId: uid ?? null,
            metadata: {
              profile: userProfile,
              allowedVisibility,
              source: 'general_knowledge',
              kbChunksFound: 0,
              reason: 'kb_no_answer',
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
          
          // Return NO citations for general knowledge (source hygiene - only cite KB docs actually used)
          console.log('[assistant.chatAsk] Returning general knowledge answer with NO citations (source hygiene)');
          
          return {
            answer: fallbackAnswer,
            sessionId,
            citations: [], // No citations for general knowledge - only cite KB docs actually used
            rawSources: [],
          } satisfies AssistantResponse;
        }

        // Valid KB answer - proceed with KB response
        const answer = trimmed;
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
      
      const answer = await answerQuestion(question, '', profileSummary, true, conversationHistory);
      
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

      // Return NO citations for general knowledge (source hygiene - only cite KB docs actually used)
      return {
        answer,
        sessionId,
        citations: [], // No citations for general knowledge - only cite KB docs actually used
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