import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

// Generate post suggestions using AI (tries Gemini first, falls back to OpenAI)
export const generatePostSuggestionsV2 = onCall({
  cors: [
    'https://momsfitnessmojo.com',
    'https://www.momsfitnessmojo.com',
    'https://momfitnessmojo.web.app',
    'https://momfitnessmojo.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
}, async (request) => {
  try {
    const { prompt, userContext, postType } = request.data as {
      prompt: string;
      userContext?: string;
      postType?: string;
    };

    if (!prompt || typeof prompt !== 'string') {
      return { success: false, error: 'Prompt is required' } as const;
    }

    // Fetch admin-configured prompts from Firestore
    const getAIPrompts = async () => {
      try {
        const db = getFirestore();
        const promptsDoc = await db.collection('aiPrompts').doc('postGeneration').get();
        if (promptsDoc.exists) {
          const data = promptsDoc.data();
          return {
            communityContext: data?.communityContext || '',
            guidelines: data?.guidelines || '',
            exampleTopics: data?.exampleTopics || [],
            examplePostTypes: data?.examplePostTypes || [],
            tone: data?.tone || '',
            updatedAt: data?.updatedAt?.toDate() || null,
          };
        }
        return {
          communityContext: 'Moms Fitness Mojo is a fitness and wellness community for moms in Short Hills, Millburn, and surrounding New Jersey areas. We offer workouts (yoga, pilates, HIIT, strength training), hikes, tennis, dance sessions, fitness challenges, social events (brunches, dinners, cocktail nights), and festival celebrations. Members share fitness journeys, ask questions, celebrate wins, and support each other.',
          guidelines: `- Be authentic and engaging\n- Write in a conversational, friendly tone\n- Share personal experiences or ask community questions\n- Keep it concise but detailed enough to be meaningful\n- Encourage community engagement\n- Focus on fitness, wellness, community support, and empowerment\n- Each post should feel genuine and relatable`,
          exampleTopics: ['fitness progress', 'workout tips', 'motivation', 'community events', 'wellness advice', 'personal achievements', 'questions for the community', 'support requests'],
          examplePostTypes: ['progress update', 'question', 'motivational', 'event share', 'tip sharing', 'celebration', 'support request'],
          tone: 'warm, encouraging, authentic, community-focused',
          updatedAt: null,
        };
      } catch (error) {
        console.error('❌ [AI] Error fetching post prompts from Firestore:', error);
        return {
          communityContext: 'Moms Fitness Mojo is a fitness and wellness community for moms.',
          guidelines: '- Be authentic and engaging\n- Keep it conversational\n- Encourage community engagement',
          exampleTopics: [],
          examplePostTypes: [],
          tone: 'warm and encouraging',
          updatedAt: null,
        };
      }
    };

    // Build context-aware prompt using admin-configured settings
    const buildPrompt = async () => {
      const aiPrompts = await getAIPrompts();
      let userPrompt = `You are helping a member of Moms Fitness Mojo write a community post. \n\nCOMMUNITY CONTEXT:\n${aiPrompts.communityContext}\n\n${aiPrompts.exampleTopics.length > 0 ? `\\nEXAMPLE TOPICS (mention when relevant): ${aiPrompts.exampleTopics.join(', ')}` : ''}\n${aiPrompts.examplePostTypes.length > 0 ? `\\nEXAMPLE POST TYPES (use as inspiration): ${aiPrompts.examplePostTypes.join(', ')}` : ''}\n\nGUIDELINES FOR POST GENERATION:\n${aiPrompts.guidelines}\n\n${aiPrompts.tone ? `\\nTONE: ${aiPrompts.tone}` : ''}`;
      if (userContext) userPrompt += `\n\nUser context: ${userContext}`;
      if (postType) userPrompt += `\n\nUser wants to write a: ${postType}`;
      userPrompt += `\n\nUSER'S INPUT/TOPIC: "${prompt}"`;
      userPrompt += `\n\nGenerate 2-3 post suggestions based on the user's input. Format each on a new line starting with "1.", "2.", "3.". Each should be engaging, between 50-500 characters. Make them feel authentic and encourage community engagement.`;
      return userPrompt;
    };

    // Helper to parse posts from response text
    const parsePosts = (text: string): string[] => {
      const posts = text
        .split(/\n+/)
        .map((line: string) => line.replace(/^\d+\.\s*/, '').trim().replace(/^["']|["']$/g, ''))
        .filter((line: string) => line.length >= 20 && line.length <= 2000)
        .slice(0, 3);
      if (posts.length === 0) posts.push(text.trim().substring(0, 500));
      return posts;
    };

    // Try Gemini first (with legacy fallback to functions.config for migration safety)
    let geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const functions = require('firebase-functions');
        const config = functions.config();
        geminiApiKey = config?.gemini?.api_key;
      } catch {}
    }

    if (geminiApiKey) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-pro', 'gemini-1.0-pro'];
        let text = '';
        for (const modelName of modelsToTry) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const systemPrompt = await buildPrompt();
            const result = await model.generateContent(systemPrompt);
            const response = await result.response;
            text = response.text();
            break;
          } catch (modelError: any) {
            console.log(`❌ [Gemini] Model ${modelName} failed:`, modelError?.message);
            continue;
          }
        }
        if (text) {
          return { success: true, suggestions: parsePosts(text) } as const;
        }
      } catch (geminiError: any) {
        console.error('❌ [Gemini] Error:', geminiError?.message);
      }
    }

    // Fallback to OpenAI
    let openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const functions = require('firebase-functions');
        const config = functions.config();
        openaiApiKey = config?.openai?.api_key;
      } catch {}
    }
    if (!openaiApiKey) {
      console.error('❌ Neither GEMINI_API_KEY nor OPENAI_API_KEY configured');
      return { success: false, error: 'AI service not configured. Please add GEMINI_API_KEY or OPENAI_API_KEY to .env file.' } as const;
    }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const userPrompt = await buildPrompt();
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are helping a member of Moms Fitness Mojo write a community post. Be authentic, engaging, and community-focused.' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    });
    const text = completion.choices[0]?.message?.content || '';
    return { success: true, suggestions: parsePosts(text) } as const;

  } catch (error: any) {
    console.error('❌ [AI Service] Error generating post suggestions:', error);
    return { success: false, error: error?.message || 'Failed to generate suggestions. Please try again or write your own post.' } as const;
  }
});



