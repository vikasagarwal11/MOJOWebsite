import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExerciseSwapDialog from '../exercise/ExerciseSwapDialog';

const MAX_NOTES_LENGTH = 500;

type Session = {
  title: string;
  type: 'strength' | 'hiit' | 'mobility' | 'walk';
  minutes: number;
  blocks?: Array<{ name: string; items?: string[] }>;
};

type Props = {
  session: Session;
  onClose: () => void;
  onComplete: (summary: { rpe?: number; notes?: string; rounds?: number; blocks?: Array<{ name: string; items?: string[] }>; swaps?: Array<{ blockIndex: number; itemIndex: number; from: string; to: string }> }) => void;
  allowEquipment?: Record<string, boolean>;
  difficulty?: 'beginner'|'intermediate'|'advanced';
};

export default function SessionPlayer({ session, onClose, onComplete, allowEquipment, difficulty }: Props) {
  const totalSeconds = Math.max(60, Math.round(session.minutes * 60));
  const PREP_DURATION = 5;
  const SPEECH_KEY = 'mojo.workouts.speechEnabled';

  const [status, setStatus] = useState<'idle' | 'prep' | 'running' | 'paused' | 'finished'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [workPhase, setWorkPhase] = useState<'work' | 'rest'>('work');
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'simple'|'hiit'|'emom'|'amrap'>(session.type === 'hiit' ? 'hiit' : 'simple');
  const [rounds, setRounds] = useState(0);
  const [hiit, setHiit] = useState({ work: 40, rest: 20 });
  const [emom, setEmom] = useState({ cycle: 60 });
  const [prepRemaining, setPrepRemaining] = useState(PREP_DURATION);
  const [swap, setSwap] = useState<{ open: boolean; blockIndex: number; itemIndex: number; name: string }>({ open: false, blockIndex: -1, itemIndex: -1, name: '' });
  // Per-block timing (simple mode only) with local mutability for swaps
  const [blocks, setBlocks] = useState<Array<{ name: string; items?: string[] }>>(session.blocks ?? []);
  useEffect(() => { setBlocks(session.blocks ?? []); }, [session]);
  const hasBlockTiming = mode === 'simple' && blocks.length > 0;
  const [blockIndex, setBlockIndex] = useState(0);
  const [blockElapsed, setBlockElapsed] = useState(0);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(SPEECH_KEY);
    return stored === null ? true : stored === 'true';
  });
  const timerRef = useRef<number | null>(null);
  const prepTimerRef = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const maybeSpeak = useCallback((text: string) => {
    if (!speechEnabled) return;
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        u.pitch = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {}
  }, [speechEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SPEECH_KEY, speechEnabled ? 'true' : 'false');
    if (!speechEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [speechEnabled]);

  // Allocate total time across blocks (min 30s per block) deterministically
  const perBlockSeconds = useMemo(() => {
    if (!hasBlockTiming) return [] as number[];
    const min = 30;
    const base = Math.floor(totalSeconds / blocks.length);
    const alloc = Array(blocks.length).fill(Math.max(min, base));
    const sum = alloc.reduce((a,b)=>a+b,0);
    const diff = totalSeconds - sum;
    if (diff !== 0 && alloc.length) alloc[alloc.length-1] += diff; // normalize
    return alloc as number[];
  }, [hasBlockTiming, totalSeconds, blocks.length]);

  const phaseRemaining = useMemo(() => {
    if (mode === 'hiit') {
      const cycle = hiit.work + hiit.rest;
      const inCycle = elapsed % cycle;
      return workPhase === 'work' ? Math.max(0, hiit.work - inCycle) : Math.max(0, cycle - inCycle);
    }
    if (mode === 'emom') {
      const inMinute = elapsed % emom.cycle;
      return Math.max(0, emom.cycle - inMinute);
    }
    if (hasBlockTiming && perBlockSeconds.length > 0) {
      const currentTotal = perBlockSeconds[blockIndex] ?? 0;
      return Math.max(0, currentTotal - blockElapsed);
    }
    return totalSeconds - elapsed;
  }, [elapsed, totalSeconds, mode, workPhase, hiit.work, hiit.rest, emom.cycle, hasBlockTiming, perBlockSeconds, blockIndex, blockElapsed]);

  const overallRemaining = useMemo(() => Math.max(0, totalSeconds - elapsed), [elapsed, totalSeconds]);

  const startPrep = useCallback(() => {
    setPrepRemaining(PREP_DURATION);
    setStatus('prep');
    maybeSpeak('Get ready');
  }, [PREP_DURATION, maybeSpeak]);

  const handlePrimaryAction = () => {
    if (status === 'idle' || status === 'finished') {
      setElapsed(0);
      setWorkPhase('work');
      if (mode !== 'simple') {
        setRounds(0);
      }
      setRpe(undefined);
      setNotes('');
      startPrep();
      return;
    }
    if (status === 'prep') {
      if (prepTimerRef.current) {
        window.clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
      }
      setStatus('running');
      maybeSpeak('Go');
      return;
    }
    if (status === 'running') {
      setStatus('paused');
      return;
    }
    if (status === 'paused') {
      setStatus('running');
      return;
    }
  };

  const reset = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (prepTimerRef.current) {
      window.clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }
    setStatus('idle');
    setElapsed(0);
    setWorkPhase('work');
    setPrepRemaining(PREP_DURATION);
    setRpe(undefined);
    setNotes('');
    if (mode !== 'simple') {
      setRounds(0);
    }
    setBlockIndex(0);
    setBlockElapsed(0);
  }, [PREP_DURATION, mode]);

  const tick = useCallback(() => {
    setElapsed(prev => {
      const next = prev + 1;
      if (mode === 'hiit') {
        const cycle = hiit.work + hiit.rest;
        const inCycle = next % cycle;
        if (inCycle === 0) { setWorkPhase('work'); maybeSpeak('Work'); }
        else if (inCycle === hiit.work) { setWorkPhase('rest'); maybeSpeak('Rest'); }
        else if (inCycle === hiit.work - 3 || inCycle === cycle - 3) maybeSpeak('3');
        else if (inCycle === hiit.work - 2 || inCycle === cycle - 2) maybeSpeak('2');
        else if (inCycle === hiit.work - 1 || inCycle === cycle - 1) maybeSpeak('1');
      } else if (mode === 'emom') {
        // New minute chime
        if (next % emom.cycle === 0) { maybeSpeak('Go'); setRounds(r => r + 1); }
      } else if (hasBlockTiming && perBlockSeconds.length > 0) {
        setBlockElapsed(be => {
          const updated = be + 1;
          const blockTotal = perBlockSeconds[blockIndex] ?? 0;
          if (updated >= blockTotal) {
            const nextIdx = blockIndex + 1;
            if (nextIdx < blocks.length) {
              setBlockIndex(nextIdx);
              maybeSpeak(`Next: ${blocks[nextIdx]?.name || 'Block'}`);
              return 0;
            }
          }
          return updated;
        });
      }
      return next;
    });
  }, [mode, hiit.work, hiit.rest, emom.cycle, maybeSpeak, hasBlockTiming, perBlockSeconds, blockIndex, blocks.length, blocks]);

  useEffect(() => {
    if (status !== 'prep') {
      if (prepTimerRef.current) {
        window.clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
      }
      return;
    }
    setPrepRemaining(PREP_DURATION);
    const id = window.setInterval(() => {
      setPrepRemaining(prev => {
        const next = prev - 1;
        if (next <= 0) {
          window.clearInterval(id);
          prepTimerRef.current = null;
          setStatus('running');
          setPrepRemaining(PREP_DURATION);
          maybeSpeak('Go');
          return PREP_DURATION;
        }
        if (next <= 3) {
          maybeSpeak(String(next));
        }
        return next;
      });
    }, 1000);
    prepTimerRef.current = id;
    return () => {
      if (id) window.clearInterval(id);
      prepTimerRef.current = null;
    };
  }, [status, PREP_DURATION, maybeSpeak]);

  useEffect(() => {
    if (status !== 'running') {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (overallRemaining <= 0) return;
    timerRef.current = window.setInterval(tick, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = null; };
  }, [status, tick, overallRemaining]);

  useEffect(() => {
    if (overallRemaining <= 0 && status === 'running') {
      setStatus('finished');
      maybeSpeak('Session complete');
    }
  }, [overallRemaining, status, maybeSpeak]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (prepTimerRef.current) window.clearInterval(prepTimerRef.current);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const done = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Compute swaps between original session blocks and current blocks (names only)
      const original = session.blocks ?? [];
      const changes: Array<{ blockIndex: number; itemIndex: number; from: string; to: string }> = [];
      for (let i = 0; i < Math.max(original.length, blocks.length); i++) {
        const a = original[i]?.items || [];
        const b = blocks[i]?.items || [];
        const max = Math.max(a.length, b.length);
        for (let j = 0; j < max; j++) {
          const from = (a[j] || '').toString();
          const to = (b[j] || '').toString();
          if (from && to && from !== to) {
            changes.push({ blockIndex: i, itemIndex: j, from, to });
          }
        }
      }

      await onComplete({
        rpe,
        notes: (notes.trim() || undefined),
        ...(rounds ? { rounds } : {}),
        blocks,
        swaps: changes,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="text-sm text-gray-500">Session</div>
          <div className="text-xl font-semibold text-gray-900">{session.title}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase">
            {session.type} • {session.minutes} min
            {status === 'paused' && <span className="ml-2 text-amber-600">Paused</span>}
          </div>
        </div>

        <div className="p-5">
          {/* Mode presets */}
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {(['simple','hiit','emom','amrap'] as const).map(m => (
              <button key={m} onClick={()=> { setMode(m); reset(); setRounds(0); }}
                className={`px-3 py-1.5 rounded text-xs border ${mode===m ? 'bg-black text-white' : ''}`}>{m.toUpperCase()}</button>
            ))}
            {mode==='hiit' && (
              <div className="ml-2 text-xs text-gray-700 flex items-center gap-2">
                <label>Work
                  <input type="number" value={hiit.work} onChange={e=> setHiit(v=>({...v, work: Math.max(10, Math.min(120, Number(e.target.value)||40))}))}
                    className="ml-1 w-16 border rounded px-2 py-1" />s
                </label>
                <label>Rest
                  <input type="number" value={hiit.rest} onChange={e=> setHiit(v=>({...v, rest: Math.max(5, Math.min(120, Number(e.target.value)||20))}))}
                    className="ml-1 w-16 border rounded px-2 py-1" />s
                </label>
              </div>
            )}
            {mode==='emom' && (
              <div className="ml-2 text-xs text-gray-700">
                Cycle: <input type="number" value={emom.cycle} onChange={e=> setEmom({ cycle: Math.max(30, Math.min(120, Number(e.target.value)||60)) })}
                  className="ml-1 w-16 border rounded px-2 py-1" />s
                <span className="ml-3">Rounds: <span className="font-semibold">{rounds}</span></span>
              </div>
            )}
            {mode==='amrap' && (
              <div className="ml-2 text-xs text-gray-700">
                Rounds: <span className="font-semibold">{rounds}</span>
                <button onClick={()=> setRounds(r => r + 1)} className="ml-2 px-2 py-1 rounded border">+ Round</button>
              </div>
            )}
          </div>
          {/* Timer */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-5xl font-bold tabular-nums">
                {status === 'prep' ? `00:${prepRemaining.toString().padStart(2, '0')}` : mmss(overallRemaining)}
              </div>
              <div className="text-xs text-gray-500">
                {status === 'prep' ? 'Get ready' : 'Remaining'}
              </div>
            </div>
            {mode === 'hiit' && (
              <div className="text-right">
                <div className={`text-xl font-semibold ${workPhase==='work' ? 'text-green-600' : 'text-blue-600'}`}>{workPhase.toUpperCase()}</div>
                <div className="text-sm text-gray-600">{mmss(phaseRemaining)}</div>
              </div>
            )}
            {mode === 'emom' && (
              <div className="text-right">
                <div className="text-xl font-semibold text-purple-600">EMOM</div>
                <div className="text-sm text-gray-600">Cycle: {mmss(phaseRemaining)} • Rounds: {rounds}</div>
              </div>
            )}
            {hasBlockTiming && (
              <div className="text-right">
                <div className="text-sm text-gray-700">Block {blockIndex+1}/{blocks.length}</div>
                <div className="text-xs text-gray-600">{blocks[blockIndex]?.name || 'Block'} • {mmss(phaseRemaining)}</div>
              </div>
            )}
          </div>

          {/* Blocks overview */}
          {blocks.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-2 max-h-40 overflow-auto">
              {blocks.map((b, i) => (
                <div key={i} className={`border rounded-lg px-3 py-2 ${hasBlockTiming && i===blockIndex ? 'bg-orange-50 border-orange-300' : 'bg-gray-50'}`}>
                  <div className="text-sm font-medium text-gray-800 flex items-center justify-between">
                    <span>{b.name}</span>
                    {hasBlockTiming && perBlockSeconds[i]!=null && (
                      <span className="text-xs text-gray-500">{mmss(perBlockSeconds[i])}</span>
                    )}
                  </div>
                  {b.items && (
                    <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                      {b.items.map((it, j) => (
                        <div key={j} className="flex items-center justify-between gap-2">
                          <div>• {it}</div>
                          <button
                            onClick={() => setSwap({ open: true, blockIndex: i, itemIndex: j, name: it })}
                            className="px-2 py-0.5 border rounded text-[11px]"
                          >Swap</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handlePrimaryAction}
              className={`px-4 py-2 rounded text-white ${
                status === 'running'
                  ? 'bg-yellow-600'
                  : status === 'prep'
                  ? 'bg-blue-600'
                  : 'bg-green-600'
              }`}
            >
              {status === 'running'
                ? 'Pause'
                : status === 'paused'
                ? 'Resume'
                : status === 'prep'
                ? 'Skip Countdown'
                : 'Start'}
            </button>
            <button onClick={reset} className="px-4 py-2 rounded border">Reset</button>
            {hasBlockTiming && (
              <>
                <button onClick={()=> { if (blockIndex>0){ setBlockIndex(blockIndex-1); setBlockElapsed(0); maybeSpeak(`Back: ${blocks[blockIndex-1]?.name||'Block'}`);} }} className="px-3 py-2 rounded border">Prev</button>
                <button onClick={()=> { if (blockIndex<blocks.length-1){ setBlockIndex(blockIndex+1); setBlockElapsed(0); maybeSpeak(`Next: ${blocks[blockIndex+1]?.name||'Block'}`);} }} className="px-3 py-2 rounded border">Next</button>
              </>
            )}
            <button
              onClick={() => setSpeechEnabled(v => !v)}
              className={`px-4 py-2 rounded border ${speechEnabled ? 'border-green-500 text-green-600' : 'text-gray-600'}`}
              aria-pressed={speechEnabled}
            >
              {speechEnabled ? 'Voice On' : 'Voice Off'}
            </button>
            <div className="ml-auto" />
            <button onClick={onClose} className="px-3 py-2 rounded border">Close</button>
          </div>

          {/* Completion */}
          {status === 'finished' && (
            <div className="mt-6 border-t pt-4">
              <div className="text-sm font-medium mb-2">How hard was it? (RPE 1–10)</div>
              <div className="flex items-center gap-2 flex-wrap">
                {Array.from({ length: 10 }).map((_, i) => (
                  <button key={i} onClick={()=> setRpe(i+1)}
                    className={`px-2 py-1 rounded border text-xs ${rpe===i+1 ? 'bg-black text-white' : ''}`}>{i+1}</button>
                ))}
              </div>
              {mode !== 'simple' && (
                <div className="mt-3 text-sm text-gray-700">Rounds completed: <span className="font-semibold">{rounds}</span></div>
              )}
              <div className="mt-3">
                <textarea
                  value={notes}
                  onChange={e=> setNotes(e.target.value.slice(0, MAX_NOTES_LENGTH))}
                  placeholder="Notes (optional)"
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                  maxLength={MAX_NOTES_LENGTH}
                />
                <div className="mt-1 text-xs text-gray-400 text-right">
                  {notes.length}/{MAX_NOTES_LENGTH}
                </div>
              </div>
              <div className="mt-3">
                <button
                  onClick={done}
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Save completion'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ExerciseSwapDialog
        open={swap.open}
        baseName={swap.name}
        onClose={() => setSwap({ open: false, blockIndex: -1, itemIndex: -1, name: '' })}
        onSelect={(newName) => {
          setBlocks(prev => {
            const copy = prev.map(b => ({ ...b, items: b.items ? [...b.items] : [] }));
            if (swap.blockIndex >=0 && swap.itemIndex >=0 && copy[swap.blockIndex]?.items) {
              (copy[swap.blockIndex].items as string[])[swap.itemIndex] = newName;
            }
            return copy;
          });
          setSwap({ open: false, blockIndex: -1, itemIndex: -1, name: '' });
        }}
        allowEquipment={allowEquipment as any}
        difficulty={difficulty}
      />
    </div>
  );
}
