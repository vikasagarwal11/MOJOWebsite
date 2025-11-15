import { httpsCallable } from 'firebase/functions';
import { functions, functionsUsCentral1, auth } from '../config/firebase';

export interface AssistantMessage {
  from: 'user' | 'assistant';
  text: string;
}

export interface AssistantCitation {
  id: string;
  title: string;
  url: string | null;
  sourceType: string;
  distance?: number | null;
  snippet: string;
}

export interface AssistantResponse {
  answer: string;
  sessionId: string;
  citations: AssistantCitation[];
}

const assistantFunctions = functionsUsCentral1 ?? functions;

const chatCallable = httpsCallable(assistantFunctions, 'chatAsk');
const transcribeCallable = httpsCallable(assistantFunctions, 'transcribeAudio');
const transcribeLongCallable = httpsCallable(assistantFunctions, 'transcribeLongAudio');
const synthesizeCallable = httpsCallable(assistantFunctions, 'synthesizeSpeech');

// Optional Cloud Run streaming transcriber WS endpoint
const STREAMING_WS = (import.meta as any).env?.VITE_STREAMING_TRANSCRIBER_WS as string | undefined;

export async function askAssistant(
  question: string,
  options?: { sessionId?: string; history?: AssistantMessage[] }
): Promise<AssistantResponse> {
  const payload = {
    question,
    sessionId: options?.sessionId,
    history: options?.history,
  };
  const result = await chatCallable(payload);
  const data = result.data as AssistantResponse;
  return data;
}

export async function transcribeAudio(
  base64Audio: string,
  opts?: { encoding?: string; sampleRateHertz?: number }
): Promise<string> {
  const result = await transcribeCallable({
    audioContent: base64Audio,
    encoding: opts?.encoding,
    sampleRateHertz: opts?.sampleRateHertz,
  });
  const data = result.data as { transcript?: string };
  return (data.transcript || '').trim();
}

export async function transcribeLongAudio(
  base64AudioOrGcsUri: string,
  opts?: { encoding?: string; sampleRateHertz?: number; languageCode?: string; isGcsUri?: boolean }
): Promise<string> {
  const payload = opts?.isGcsUri
    ? { gcsUri: base64AudioOrGcsUri, languageCode: opts?.languageCode }
    : { audioContent: base64AudioOrGcsUri, encoding: opts?.encoding, sampleRateHertz: opts?.sampleRateHertz, languageCode: opts?.languageCode };
  const result = await transcribeLongCallable(payload as any);
  const data = result.data as { transcript?: string };
  return (data.transcript || '').trim();
}

// Heuristic: ~1.33x expansion for base64; 1 MB ~ 1,333,333 chars
export async function transcribeAudioAuto(
  base64Audio: string,
  opts?: { encoding?: string; sampleRateHertz?: number; languageCode?: string }
): Promise<string> {
  const approxBytes = Math.floor(base64Audio.length * 0.75);
  // Keep the fast path for typical microphone snippets (<= ~3MB); use long-running only for
  // truly large files so the UI can show transcription sooner after stop.
  if (approxBytes > 3_000_000) {
    return transcribeLongAudio(base64Audio, {
      encoding: opts?.encoding,
      sampleRateHertz: opts?.sampleRateHertz,
      languageCode: opts?.languageCode || 'en-US',
    });
  }
  return transcribeAudio(base64Audio, opts);
}

export type StreamingMessage = { type: 'partial' | 'final' | 'error'; text?: string; message?: string };

export function openStreamingTranscriber(lang = 'en-US') {
  if (!STREAMING_WS) return null;
  const wsUrl = STREAMING_WS.includes('?') ? `${STREAMING_WS}` : `${STREAMING_WS}?lang=${encodeURIComponent(lang)}`;
  const ws = new WebSocket(wsUrl);
  return ws;
}

// Authenticated variant: appends Firebase ID token if available
export async function openStreamingTranscriberAuthed(lang = 'en-US') {
  if (!STREAMING_WS) return null;
  let base = STREAMING_WS.includes('?') ? `${STREAMING_WS}` : `${STREAMING_WS}?lang=${encodeURIComponent(lang)}`;
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      const sep = base.includes('?') ? '&' : '?';
      base = `${base}${sep}token=${encodeURIComponent(token)}`;
    }
  } catch {}
  return new Promise<WebSocket>((resolve, reject) => {
    try {
      const ws = new WebSocket(base);
      ws.onopen = () => resolve(ws);
      ws.onerror = (e) => reject(e);
    } catch (e) {
      reject(e);
    }
  });
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const result = await synthesizeCallable({ text });
  const data = result.data as { audioContent?: string };
  return data.audioContent || '';
}
