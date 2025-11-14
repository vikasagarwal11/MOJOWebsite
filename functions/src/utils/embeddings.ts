import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

export async function embedText(text: string): Promise<number[]> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured');
  }

  const clean = text?.toString?.().trim();
  if (!clean) {
    throw new Error('Cannot embed empty text');
  }

  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(clean);
  const embedding = result.embedding?.values;
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Failed to compute embedding');
  }

  return embedding;
}

