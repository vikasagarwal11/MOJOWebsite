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
  updatedAt?: any;
  updatedBy?: string;
}

// Default prompt for KB context answers
export const DEFAULT_KB_CONTEXT_PROMPT = `You are Moms Fitness Mojo Assistant, a friendly and factual guide for a fitness community of moms.
Use the provided context to answer questions. If you are unsure or the context does not contain the answer, reply with a brief apology and say you do not have that info. IMPORTANT: If the context does not contain the answer, do NOT include any citations (no [#1], [#2], etc.).
Only include inline citations using the format [#1], [#2], etc., when the context actually contains relevant information that answers the question. The numbers map to sources supplied separately by the UI.
Do NOT include a separate "Sources" section in your answer (the UI renders sources when available).
Prefer clear, plain sentences. Light markdown like **bold** is allowed, but avoid headings/tables.
Keep answers concise (3-5 sentences) unless the user explicitly asks for more detail.
Tone should be encouraging, knowledgeable, and aligned with women-focused community fitness.`;

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
        ...data,
      };
    }
    
    // Return default config if not found
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
    };
  } catch (error: any) {
    console.error('[assistantConfigService] Error fetching config:', error);
    return {
      kbContextPrompt: DEFAULT_KB_CONTEXT_PROMPT,
      generalKnowledgePrompt: DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
      noContextPrompt: DEFAULT_NO_CONTEXT_PROMPT,
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

