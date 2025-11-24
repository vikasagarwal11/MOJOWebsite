import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const ASSISTANT_CONFIG_DOC = 'system_config';
const ASSISTANT_CONFIG_COLLECTION = 'assistant_config';

export interface AssistantConfig {
  // Prompt for when KB context is available
  kbContextPrompt?: string;
  // Prompt for general knowledge answers (no KB context)
  generalKnowledgePrompt?: string;
  // Prompt for when no context and general knowledge is disabled
  noContextPrompt?: string;
  // KB similarity threshold (0.0 to 1.0, lower = stricter)
  similarityThreshold?: number;
  updatedAt?: any;
  updatedBy?: string;
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.22;

// Default prompt for KB context answers
export const DEFAULT_KB_CONTEXT_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.

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
   - "Aina Rai" = "Aina" (the founder)
   - Use context even if the question uses abbreviations or variations

2. Be flexible with wording:
   - If the context contains relevant information (even if worded differently), use it
   - Paraphrase and synthesize information from multiple context sources
   - Connect related concepts from the KB to answer the question

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

// Default prompt for general knowledge answers
export const DEFAULT_GENERAL_KNOWLEDGE_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.

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
export const DEFAULT_NO_CONTEXT_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.
If you are unsure or do not have the information, reply with a brief apology and say you do not have that info.
Do not include citations when answering from general knowledge (no source numbers needed).
Prefer clear, plain sentences. Light markdown like **bold** is allowed, but avoid headings/tables.
Keep answers concise (3-5 sentences) unless the user explicitly asks for more detail.
Tone should be encouraging, knowledgeable, and aligned with women-focused community fitness.`;

export async function getAssistantConfig(): Promise<AssistantConfig> {
  try {
    const configRef = doc(db, ASSISTANT_CONFIG_COLLECTION, ASSISTANT_CONFIG_DOC);
    const configSnap = await getDoc(configRef);
    
    if (configSnap.exists()) {
      const data = configSnap.data() as AssistantConfig;
      // Merge with defaults to ensure all prompts are available
      return {
        kbContextPrompt: data.kbContextPrompt || DEFAULT_KB_CONTEXT_PROMPT,
        generalKnowledgePrompt: data.generalKnowledgePrompt || DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
        noContextPrompt: data.noContextPrompt || DEFAULT_NO_CONTEXT_PROMPT,
        similarityThreshold: data.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
        ...data,
      };
    }
    
    // Return default config if not found
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
      similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    };
  } catch (error: any) {
    console.error('[assistantConfigService] Error fetching config:', error);
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
      similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    };
  }
}

export async function updateAssistantConfig(
  config: Partial<AssistantConfig>,
  userId: string
): Promise<void> {
  try {
    const configRef = doc(db, ASSISTANT_CONFIG_COLLECTION, ASSISTANT_CONFIG_DOC);
    await setDoc(
      configRef,
      {
        ...config,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      },
      { merge: true }
    );
  } catch (error: any) {
    console.error('[assistantConfigService] Error updating config:', error);
    throw error;
  }
}

