import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Mic, Square, Send, Loader2, Volume2, VolumeX, BookOpen, Copy, Share2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  askAssistant,
  AssistantCitation,
  AssistantMessage,
  synthesizeSpeech,
  transcribeAudioAuto,
  transcribeLongAudio,
  openStreamingTranscriberAuthed,
} from '../../services/assistantService';

interface AssistantThreadItem {
  id: string;
  from: 'user' | 'assistant';
  text: string;
  citations?: AssistantCitation[];
}

const createId = () => crypto.randomUUID();
const MAX_RECORDING_MS = 45000;
const SILENCE_THRESHOLD = 0.05; // Audio level threshold for silence detection (higher = less sensitive to background noise)
const SILENCE_DURATION_MS = 1200; // Stop after 1.2 seconds of silence (balanced response)
const MAX_SYNC_AUDIO_DURATION_MS = 55000; // Use long-running API for recordings >55 seconds

// Strip markdown formatting for TTS (removes **bold**, *italic*, citations, etc.)
// Preserves sentence structure and ensures complete text is not truncated
function stripMarkdownForTTS(text: string): string {
  if (!text) return '';
  
  // Step 1: Remove the "Sources:" section and everything after it (UI handles sources separately)
  // This section should not be read aloud as it's just metadata
  let processed = text;
  const sourcesMatch = processed.match(/\n\s*Sources?\s*:/i);
  if (sourcesMatch) {
    processed = processed.substring(0, sourcesMatch.index).trim();
  }
  
  // Also remove any "Sources:" at the end without newlines (edge case)
  processed = processed.replace(/\s+Sources?\s*:\s*$/i, '');
  
  // Step 2: Remove citations and format text for TTS
  let cleaned = processed
    // Remove citation markers completely (they're usually at word boundaries)
    .replace(/\[#\d+(?:\s*,\s*#\d+)*\]/g, '') // Remove [#1], [#1, #2, #3], etc.
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '') // Remove [1], [1, 2, 3], etc.
    .replace(/\[#\d+\]/g, '') // Remove single [#n] (fallback)
    .replace(/\[\d+\]/g, '') // Remove single [n] (fallback)
    // Handle actual links (format: [text](url)) - extract text only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) -> link
    // Remove markdown formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1') // *italic* -> italic (but preserve citations already removed)
    .replace(/__([^_]+)__/g, '$1') // __bold__ -> bold
    .replace(/_([^_]+)_/g, '$1') // _italic_ -> italic
    .replace(/`([^`]+)`/g, '$1') // `code` -> code
    .replace(/#{1,6}\s+/g, '') // Headers
    // Convert newlines to spaces (preserve sentence breaks)
    .replace(/\n{3,}/g, ' ') // Multiple newlines -> single space
    .replace(/\n/g, ' ') // Single newlines -> space
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs to single space
    // Normalize spacing around punctuation
    .replace(/\s+([.!?,;:])/g, '$1') // Remove spaces before punctuation
    .replace(/([.!?])\s+/g, '$1 ') // Ensure space after sentence-ending punctuation
    .trim();
  
  // Step 3: Ensure text flows naturally and ends properly
  // Don't add punctuation if text already ends with it
  if (cleaned && cleaned.length > 0) {
    const trimmed = cleaned.trim();
    // Verify text ends with proper punctuation for natural TTS flow
    if (!/[.!?]$/.test(trimmed) && trimmed.length > 5) {
      // Text appears complete but lacks final punctuation - add period
      // Only if it ends with a letter (not cut off mid-word)
      const lastChar = trimmed.slice(-1);
      if (/[a-zA-Z]/.test(lastChar)) {
        cleaned = trimmed + '.';
      } else {
        cleaned = trimmed;
      }
    } else {
      cleaned = trimmed;
    }
  }
  
  return cleaned;
}

function base64Encode(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

const AUTOSPEAK_PREF_KEY = 'mojo.assistant.autoSpeak';

const AssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<AssistantThreadItem[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(AUTOSPEAK_PREF_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recordTimeoutRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastFinalTextRef = useRef<string>('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const citationRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceCheckIntervalRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const hasActivityRef = useRef<boolean>(false);
  const selectedEncodingRef = useRef<'WEBM_OPUS' | 'OGG_OPUS' | undefined>('WEBM_OPUS');
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<Record<string, number>>({});
  const voiceSessionActiveRef = useRef(false);

  const hasConversation = messages.length > 0;

  const logTimelineEvent = useCallback((label: string) => {
    const now = Date.now();
    if (!timelineRef.current.start) {
      timelineRef.current.start = now;
    }
    const elapsed = now - timelineRef.current.start;
    const key = label.replace(/\s+/g, '_');
    timelineRef.current[key] = now;
    console.info(`[AssistantWidget] ${label} (+${elapsed}ms) @ ${new Date(now).toISOString()}`);
    return elapsed;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AUTOSPEAK_PREF_KEY, autoSpeak ? 'true' : 'false');
  }, [autoSpeak]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Stop any currently playing audio immediately
  const stopAudioPlayback = useCallback(() => {
    if (playingAudioRef.current) {
      try {
        playingAudioRef.current.pause();
        playingAudioRef.current.currentTime = 0;
        playingAudioRef.current.src = '';
        playingAudioRef.current.load();
      } catch (e) {
        // Ignore errors when stopping audio
      }
      playingAudioRef.current = null;
    }
  }, []);

  const stopPlaybackAndSpeak = useCallback(async (text: string) => {
    try {
      // Stop any currently playing audio before starting new one
      stopAudioPlayback();
      
      // Log original text for debugging
      console.log(`[AssistantWidget] TTS original text length: ${text.length} chars`);
      console.log(`[AssistantWidget] TTS original text (last 200 chars): ${text.slice(-200)}`);
      
      // Strip markdown formatting before TTS so it doesn't read "asterisk asterisk"
      const cleanText = stripMarkdownForTTS(text);
      
      // Log cleaned text for debugging
      console.log(`[AssistantWidget] TTS cleaned text length: ${cleanText.length} chars`);
      console.log(`[AssistantWidget] TTS cleaned text (first 200 chars): ${cleanText.slice(0, 200)}`);
      console.log(`[AssistantWidget] TTS cleaned text (last 200 chars): ${cleanText.slice(-200)}`);
      
      // Log text length for debugging (Google TTS limit is 5000 characters)
      if (cleanText.length > 4500) {
        console.warn(`[AssistantWidget] TTS text is long (${cleanText.length} chars), may need splitting`);
      }
      
      // Ensure text is not empty and has content
      if (!cleanText || cleanText.trim().length === 0) {
        console.warn('[AssistantWidget] TTS text is empty after cleaning');
        return;
      }
      
      // Verify text ends properly
      if (!/[.!?]$/.test(cleanText.trim())) {
        console.warn(`[AssistantWidget] TTS text doesn't end with punctuation: "${cleanText.slice(-50)}"`);
      }
      
      const audioBase64 = await synthesizeSpeech(cleanText);
      if (audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
        playingAudioRef.current = audio;
        
        // Log audio events for debugging
        audio.onloadeddata = () => {
          console.log(`[AssistantWidget] TTS audio loaded, duration: ${audio.duration}s, text length: ${cleanText.length} chars`);
          console.log(`[AssistantWidget] TTS estimated speaking time: ${(cleanText.length / 150).toFixed(1)}s (assuming ~150 chars/sec)`);
        };
        
        audio.onended = () => {
          console.log('[AssistantWidget] TTS audio playback ended normally');
          if (playingAudioRef.current === audio) {
            playingAudioRef.current = null;
          }
        };
        
        audio.onerror = (e) => {
          console.error('[AssistantWidget] TTS audio playback error', e, audio.error);
        };
        
        audio.onpause = () => {
          console.log(`[AssistantWidget] TTS audio paused at ${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s`);
        };
        
        audio.onstalled = () => {
          console.warn('[AssistantWidget] TTS audio stalled');
        };
        
        // Track playback progress
        let lastProgress = 0;
        audio.addEventListener('timeupdate', () => {
          if (!audio.duration || audio.duration === 0) return;
          const progress = audio.currentTime / audio.duration;
          // Log progress every 25%
          if (Math.floor(progress * 4) > Math.floor(lastProgress * 4)) {
            console.log(`[AssistantWidget] TTS playback: ${(progress * 100).toFixed(1)}% (${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s)`);
          }
          lastProgress = progress;
        });
        
        await audio.play();
        console.log('[AssistantWidget] TTS audio playback started');
      } else {
        console.error('[AssistantWidget] TTS returned empty audio');
      }
    } catch (error: any) {
      console.error('[AssistantWidget] TTS error', error?.message, error);
    }
  }, [stopAudioPlayback]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      const userMessage: AssistantThreadItem = {
        id: createId(),
        from: 'user',
        text: trimmed,
      };

      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsSending(true);
      const isVoiceFlow = voiceSessionActiveRef.current;
      if (isVoiceFlow) {
        logTimelineEvent('Sending question to assistant');
      }

      try {
        const history: AssistantMessage[] = messages
          .map(m => ({ from: m.from, text: m.text }))
          .concat({ from: 'user', text: trimmed });

        const result = await askAssistant(trimmed, { sessionId, history });
        setSessionId(result.sessionId);

        const assistantMessage: AssistantThreadItem = {
          id: createId(),
          from: 'assistant',
          text: result.answer,
          citations: result.citations,
        };

        setMessages(prev => [...prev, assistantMessage]);
        if (isVoiceFlow) {
          logTimelineEvent('Assistant response received');
          voiceSessionActiveRef.current = false;
        }

        // Auto-play response audio if enabled
        if (autoSpeak) {
          stopPlaybackAndSpeak(result.answer);
        }
      } catch (error: any) {
        console.error('[AssistantWidget] askAssistant error', error);
        toast.error(error?.message || 'Assistant is unavailable right now.');
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      } finally {
        setIsSending(false);
        if (voiceSessionActiveRef.current && isVoiceFlow) {
          voiceSessionActiveRef.current = false;
        }
      }
    },
    [messages, sessionId, stopPlaybackAndSpeak, autoSpeak, logTimelineEvent]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (isSending) return;
      await sendQuestion(input);
    },
    [input, isSending, sendQuestion]
  );

  const clearRecordTimeout = useCallback(() => {
    if (recordTimeoutRef.current) {
      window.clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    // Stop any audio playback when stopping recording
    stopAudioPlayback();
    
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    clearRecordTimeout();
    
    if (voiceSessionActiveRef.current && recorder.state !== 'inactive') {
      logTimelineEvent('Stop recording (manual)');
    }
    
    // Clean up silence detection
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    recorder.stream.getTracks().forEach(track => track.stop());
    mediaRecorderRef.current = null;
  }, [clearRecordTimeout, logTimelineEvent, stopAudioPlayback]);

  const beginRecording = useCallback(async () => {
    if (isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice capture is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick best-supported recording type
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      let chosen: string | undefined;
      if (typeof (window as any).MediaRecorder?.isTypeSupported === 'function') {
        for (const t of types) { if (MediaRecorder.isTypeSupported(t)) { chosen = t; break; } }
      }
      selectedEncodingRef.current = chosen?.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS';
      const options: MediaRecorderOptions = chosen ? { mimeType: chosen } : { mimeType: 'audio/webm' } as any;
      const recorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      lastFinalTextRef.current = '';
      lastSoundTimeRef.current = Date.now();
      hasActivityRef.current = false;

      // Setup silence detection using Web Audio API
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        // Check for silence every 200ms
        silenceCheckIntervalRef.current = window.setInterval(() => {
          if (!analyserRef.current || !recorder || recorder.state === 'inactive') return;
          
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const normalized = average / 255;
          
          if (normalized > SILENCE_THRESHOLD) {
            // Sound detected - update last sound time
            lastSoundTimeRef.current = Date.now();
            hasActivityRef.current = true;
            if (!timelineRef.current.soundDetected) {
              logTimelineEvent('Sound detected');
            }
          } else {
            // Silence detected - check if we've been silent long enough
            const silenceDuration = Date.now() - lastSoundTimeRef.current;
            if (silenceDuration >= SILENCE_DURATION_MS) {
              const finalText = lastFinalTextRef.current.trim();
              if (finalText) {
                logTimelineEvent('Auto-stop triggered (silence detected)');
                toast('Auto-stopped after silence', { icon: '🔇', duration: 1000 });
                stopRecording();
                // onstop handler will auto-send the message
              } else if (hasActivityRef.current) {
                logTimelineEvent('Auto-stop triggered (no transcript yet)');
                toast('Auto-stopped after silence', { icon: '🔇', duration: 1000 });
                stopRecording();
              }
            }
          }
        }, 200);
      } catch (silenceError) {
        // Silence detection is optional - continue without it
        console.warn('[AssistantWidget] Silence detection unavailable', silenceError);
      }

      // Optional streaming via Cloud Run WS (with auth token if available)
      // Try to establish WebSocket BEFORE starting recorder for faster partials
      try {
        const ws = await Promise.race([
          openStreamingTranscriberAuthed('en-US'),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('WS timeout')), 2000)),
        ]) as WebSocket | null;
        if (ws && ws.readyState === WebSocket.OPEN) {
          logTimelineEvent('WebSocket connected (streaming)');
          wsRef.current = ws;
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '{}');
              if (msg.type === 'partial' && msg.text) {
                // Show partial transcript immediately for real-time feedback
                setInput(msg.text);
                lastFinalTextRef.current = msg.text; // Update so silence detection can use it
              } else if (msg.type === 'final' && msg.text) {
                lastFinalTextRef.current = msg.text;
                setInput(msg.text);
                logTimelineEvent('Transcript displayed (stream)');
              }
            } catch {}
          };
          ws.onerror = (e) => {
            console.warn('[AssistantWidget] WebSocket error', e);
            if (voiceSessionActiveRef.current) {
              logTimelineEvent('WebSocket error (falling back to callable)');
            }
            try { ws.close(); } catch {}
            wsRef.current = null;
          };
          ws.onclose = () => {
            wsRef.current = null;
          };
        } else {
          if (voiceSessionActiveRef.current) {
            logTimelineEvent('WebSocket unavailable (using callable fallback)');
          }
        }
      } catch (wsError) {
        // If WS connection fails, we still fall back to callable
        if (voiceSessionActiveRef.current) {
          logTimelineEvent('WebSocket connection failed (using callable fallback)');
        }
        console.warn('[AssistantWidget] WebSocket unavailable, using fallback', wsError);
      }

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Send to WebSocket immediately for real-time transcription
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(event.data);
            } catch (err) {
              console.warn('[AssistantWidget] Failed to send audio chunk', err);
            }
          }
        }
      };

      recorder.onstop = async () => {
        clearRecordTimeout();
        setIsRecording(false);
        if (voiceSessionActiveRef.current) {
          logTimelineEvent('Recording stopped (onstop handler)');
        }
        try {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try { wsRef.current.send(JSON.stringify({ event: 'end' })); } catch {}
            // Wait for final transcript with timeout - check if we already have it, or wait up to 1.5s
            const initialFinal = lastFinalTextRef.current;
            if (initialFinal && initialFinal.trim()) {
              // We already have a final transcript from streaming - auto-send it
              try { wsRef.current.close(); } catch {}
              wsRef.current = null;
              toast.success('Voice captured');
              // Auto-send the message
              setTimeout(() => {
                logTimelineEvent('Auto send triggered (stream final)');
                sendQuestion(initialFinal);
              }, 100);
              return;
            }
            // Wait for final transcript with timeout
            let finalReceived = false;
            const finalPromise = new Promise<string | null>((resolve) => {
              const checkInterval = setInterval(() => {
                if (lastFinalTextRef.current && lastFinalTextRef.current !== initialFinal && lastFinalTextRef.current.trim()) {
                  clearInterval(checkInterval);
                  finalReceived = true;
                  resolve(lastFinalTextRef.current);
                }
              }, 100);
              setTimeout(() => {
                clearInterval(checkInterval);
                if (!finalReceived) {
                  resolve(null);
                }
              }, 1500); // Wait up to 1.5 seconds for final transcript
            });
            const finalText = await finalPromise;
            try { wsRef.current.close(); } catch {}
            wsRef.current = null;
            if (finalText && finalText.trim()) {
              logTimelineEvent('Transcript displayed (stream wait)');
              toast.success('Voice captured');
              // Auto-send the message
              setTimeout(() => {
                logTimelineEvent('Auto send triggered (stream wait)');
                sendQuestion(finalText);
              }, 100);
              return;
            }
            // If WebSocket didn't provide final, fall through to callable
          }
          // Fallback: callable (auto-switch to long-running for big audio)
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = base64Encode(arrayBuffer);
          const sr = audioContextRef.current?.sampleRate;
          
          // Check recording duration - use long-running API for recordings >55 seconds
          // Google's sync API has a 1-minute limit, so we use long-running for anything close
          const recordingDuration = timelineRef.current.start ? Date.now() - timelineRef.current.start : 0;
          const useLongRunning = recordingDuration > MAX_SYNC_AUDIO_DURATION_MS;
          
          let transcript: string;
          if (useLongRunning) {
            logTimelineEvent(`Recording too long (${Math.round(recordingDuration / 1000)}s), using long-running API`);
            transcript = await transcribeLongAudio(base64, {
              encoding: selectedEncodingRef.current,
              sampleRateHertz: typeof sr === 'number' ? Math.round(sr) : 48000,
              languageCode: 'en-US',
            });
          } else {
            transcript = await transcribeAudioAuto(base64, {
              encoding: selectedEncodingRef.current,
              sampleRateHertz: typeof sr === 'number' ? Math.round(sr) : 48000,
            });
          }
          if (transcript && transcript.trim()) {
            setInput(transcript);
            logTimelineEvent('Transcript displayed (fallback)');
            toast.success('Voice captured');
            // Auto-send the message
            setTimeout(() => {
              logTimelineEvent('Auto send triggered (fallback transcription)');
              sendQuestion(transcript);
            }, 100);
          } else {
            toast.error('Sorry, I could not understand that.');
          }
        } catch (error: any) {
          console.error('[AssistantWidget] Transcription error', error);
          toast.error('Voice transcription failed.');
        }
      };

      // With streaming, request timeslices for incremental chunks (faster partials)
      // Smaller timeslice = more frequent partials = faster feedback
      const usingStreaming = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
      const timeslice = usingStreaming ? 100 : undefined;
      logTimelineEvent(`Recording started (${usingStreaming ? 'streaming' : 'callable'} mode)`);
      recorder.start(timeslice as any);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordTimeoutRef.current = window.setTimeout(() => {
        toast.error('Stopped listening after 45 seconds.');
        stopRecording();
      }, MAX_RECORDING_MS);
      toast(usingStreaming ? 'Listening (real-time)…' : 'Listening…', { icon: '🎤' });
    } catch (error: any) {
      console.error('[AssistantWidget] Microphone error', error);
      toast.error('Unable to access microphone.');
    }
  }, [isRecording, stopRecording, sendQuestion, logTimelineEvent]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      // Stop any audio playback immediately (synchronously) before starting recording
      stopAudioPlayback();
      
      voiceSessionActiveRef.current = true;
      timelineRef.current = { start: Date.now() };
      logTimelineEvent('Mic clicked');
      beginRecording();
    }
  }, [beginRecording, isRecording, stopRecording, logTimelineEvent, stopAudioPlayback]);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  function renderCitationsForMessage(messageId: string, citations?: AssistantCitation[]) {
    if (!citations || citations.length === 0) return null;
    const expanded = !!expandedCitations[messageId];
    const visible = expanded ? citations : citations.slice(0, 3);
    return (
      <div className="mt-3 border-t border-orange-100 pt-2 text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-2 uppercase tracking-wide text-[10px] text-[#F25129] font-semibold">
          <BookOpen size={12} />
          Sources
        </div>
        <ul className="space-y-1">
          {visible.map((c, idx) => (
            <li
              key={`${messageId}-${c.id}`}
              id={`cit-${messageId}-${idx + 1}`}
              ref={el => (citationRefs.current[`${messageId}-${idx + 1}`] = el)}
              className="leading-snug"
            >
              <span className="font-semibold text-gray-700">[{idx + 1}]</span>{' '}
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F25129] hover:underline"
                >
                  {c.title}
                </a>
              ) : (
                <span className="text-gray-700">{c.title}</span>
              )}
              {c.snippet ? <span className="text-gray-500"> – {c.snippet.slice(0, 120)}…</span> : null}
            </li>
          ))}
        </ul>
        {citations.length > 3 && (
          <button
            type="button"
            onClick={() => setExpandedCitations(prev => ({ ...prev, [messageId]: !expanded }))}
            className="mt-1 text-[11px] text-[#F25129] hover:underline"
          >
            {expanded ? 'Show less' : `Show more (${citations.length - 3} more)`}
          </button>
        )}
      </div>
    );
  }

  // Linkify inline [#n] citations in assistant messages to scroll to the matching source below
  const linkifyCitations = useCallback((text: string, scope: string) => {
    const parts = text.split(/(\[#\d+\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[#(\d+)\]$/);
      if (m) {
        const n = parseInt(m[1], 10);
        return (
          <button
            key={`citref-${i}`}
            type="button"
            onClick={() => {
              let el = citationRefs.current[`${scope}-${n}`];
              if (!el) {
                // If the source is hidden under collapsed view, expand first
                setExpandedCitations(prev => ({ ...prev, [scope]: true }));
                setTimeout(() => {
                  el = citationRefs.current[`${scope}-${n}`];
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    // Add highlight effect
                    el.classList.add('bg-yellow-100', 'transition-colors', 'duration-1000');
                    setTimeout(() => {
                      el?.classList.remove('bg-yellow-100');
                    }, 1000);
                  }
                }, 50);
              } else {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                // Add highlight effect
                el.classList.add('bg-yellow-100', 'transition-colors', 'duration-1000');
                setTimeout(() => {
                  el?.classList.remove('bg-yellow-100');
                }, 1000);
              }
            }}
            className="text-[#F25129] hover:underline font-semibold"
          >
            [{n}]
          </button>
        );
      }
      return <span key={`t-${i}`}>{part}</span>;
    });
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-40 rounded-full bg-[#F25129] text-white shadow-2xl w-14 h-14 flex items-center justify-center hover:bg-[#E0451F] transition"
        aria-label="Open Mojo Assistant"
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-[320px] md:w-[380px] bg-white rounded-2xl shadow-2xl border border-orange-100 overflow-hidden flex flex-col max-h-[70vh]">
          <header className="bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Moms Fitness Mojo Assistant</div>
              <div className="text-[11px] opacity-80">Ask about workouts, events, challenges & policies — now backed by our community knowledge base.</div>
            </div>
            <button
              onClick={toggleOpen}
              className="p-1 rounded-full hover:bg-white/20 transition"
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm" ref={scrollContainerRef}>
            {!hasConversation && (
              <div className="bg-orange-50 border border-orange-100 text-orange-800 rounded-xl px-3 py-2 text-[13px] leading-relaxed">
                <p className="font-semibold">Hi! I’m Mojo, your fitness concierge.</p>
                <p>Ask me about upcoming events, how challenges work, or tips to stay consistent.</p>
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`rounded-2xl px-3 py-2 shadow-sm ${
                  msg.from === 'user'
                    ? 'bg-[#F25129] text-white ml-auto max-w-[85%]'
                    : 'bg-gray-100 text-gray-900 mr-auto max-w-[90%]'
                }`}
              >
                {msg.from === 'assistant' ? (
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {linkifyCitations(msg.text, msg.id)}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                )}

                {msg.from === 'assistant' ? (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                    <button
                      type="button"
                      title="Copy"
                      onClick={() => {
                        navigator.clipboard?.writeText(msg.text).then(
                          () => toast.success('Copied answer'),
                          () => toast.error('Copy failed')
                        );
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-200 hover:border-[#F25129] hover:text-[#F25129]"
                    >
                      <Copy size={12} /> Copy
                    </button>
                    <button
                      type="button"
                      title="Share"
                      onClick={async () => {
                        try {
                          if ((navigator as any).share) {
                            await (navigator as any).share({ text: msg.text });
                          } else {
                            await navigator.clipboard?.writeText(msg.text);
                            toast.success('Copied to clipboard');
                          }
                        } catch {}
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-200 hover:border-[#F25129] hover:text-[#F25129]"
                    >
                      <Share2 size={12} /> Share
                    </button>
                  </div>
                ) : null}

                {msg.from === 'assistant' ? renderCitationsForMessage(msg.id, msg.citations) : null}
              </div>
            ))}
          </div>

          <footer className="border-t border-orange-100 bg-white px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleRecording}
                className={`p-2 rounded-full border ${
                  isRecording ? 'border-[#F25129] bg-[#F25129] text-white animate-pulse' : 'border-gray-300 text-gray-600'
                }`}
                aria-label={isRecording ? 'Stop recording' : 'Record message'}
              >
                {isRecording ? <Square size={16} /> : <Mic size={16} />}
              </button>
              <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  placeholder={isRecording ? 'Listening…' : 'Ask anything about Moms Fitness Mojo'}
                  className="flex-1 rounded-full border border-gray-200 px-3 py-2 text-sm focus:border-[#F25129] focus:ring-[#F25129] outline-none"
                  disabled={isRecording || isSending}
                />
                <button
                  type="submit"
                  className="p-2 rounded-full bg-[#F25129] text-white hover:bg-[#E0451F] transition disabled:opacity-60"
                  disabled={isSending || !input.trim()}
                  aria-label="Send question"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </div>
            <div className="flex items-center justify-end text-[11px] text-gray-500">
              <button
                type="button"
                onClick={() => setAutoSpeak(prev => !prev)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  autoSpeak
                    ? 'bg-gradient-to-r from-[#F25129] to-[#FF8A00] text-white shadow-md hover:shadow-lg'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-[#F25129] hover:text-[#F25129]'
                }`}
                aria-pressed={autoSpeak}
                aria-label="Toggle spoken responses"
              >
                {autoSpeak ? <Volume2 size={12} /> : <VolumeX size={12} />}
                <span>{autoSpeak ? 'Voice replies on' : 'Voice replies off'}</span>
              </button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
};

export default AssistantWidget;
