import { deleteDoc, doc, orderBy, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import ExercisePreviewCard from '../components/exercise/ExercisePreviewCard';
import SessionHistoryModal from '../components/workouts/SessionHistoryModal';
import SessionPlayer from '../components/workouts/SessionPlayer';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { useLogging } from '../hooks/useLogging';
import { applyAdaptiveProgression } from '../services/adaptiveService';
import { resolveExerciseByName } from '../services/exerciseService';
import { applySessionToActiveChallenges } from '../services/userChallengeService';
import { generateWorkoutPlan, getDailyWorkoutSuggestion, PlanIntake } from '../services/workoutService';
import { stripPrescription } from '../utils/exerciseName';
import { isUserApproved } from '../utils/userUtils';

const MAX_NOTES_LENGTH = 500;
const generateId = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

const clampMinutes = (minutes: number) => Math.max(1, Math.round(minutes));
const sanitizeNotes = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTES_LENGTH);
};

export default function Workouts() {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const userPlansPath = currentUser ? `users/${currentUser.id}/plans` : undefined;
  const userSessionsPath = currentUser ? `users/${currentUser.id}/sessions` : undefined;
  const { data: plans } = useRealtimeCollection(userPlansPath as any, [orderBy('createdAt','desc')]);
  const { data: history } = useRealtimeCollection(userSessionsPath as any, [orderBy('completedAt','desc')]);
  const userMembershipsPath = currentUser ? `users/${currentUser.id}/challengeMemberships` : undefined;
  const { data: memberships } = useRealtimeCollection(userMembershipsPath as any, []);
  const latestPlan = plans?.[0];
  const nextAdjustment = latestPlan?.nextAdjustment;

  const [intake, setIntake] = useState<PlanIntake>({
    goal: 'general',
    daysPerWeek: 3,
    minutesPerSession: 20,
    level: 'beginner',
    equipment: ['none'],
    postpartum: false,
    environment: 'home',
    restrictions: [],
  });
  const [restrictionsInput, setRestrictionsInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showPlanBuilder, setShowPlanBuilder] = useState(!latestPlan);
  const [readiness, setReadiness] = useState({ sleep: 3 as 1|2|3|4|5, stress: 3 as 1|2|3|4|5, timeAvailable: 20 as 5|10|20|30|45, soreness: 1 as 0|1|2|3 });
  const [today, setToday] = useState<any>(null);
  const [playerSession, setPlayerSession] = useState<any | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const [pendingLogKey, setPendingLogKey] = useState<string | null>(null);
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [previewMap, setPreviewMap] = useState<Record<string, any[]>>({});
  const manualDocIdsRef = useRef<Map<string, string>>(new Map());
  const playerDocIdRef = useRef<string | null>(null);
  const suggestionKey = useMemo(
    () =>
      today
        ? `suggestion-${(today.title || 'session')
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '-')}-${today.minutes ?? ''}-${today.type ?? ''}`
        : null,
    [today]
  );
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const availableTypes = useMemo(() => {
    const base = new Set<string>();
    (history || []).forEach((item: any) => {
      if (item?.type) {
        base.add(item.type);
      }
    });
    const preferredOrder = ['strength', 'hiit', 'mobility', 'walk', 'rest'];
    const ordered = preferredOrder.filter((type) => base.has(type));
    const remaining = Array.from(base).filter((type) => !preferredOrder.includes(type));
    return ordered.concat(remaining);
  }, [history]);
  const filteredHistory = useMemo(() => {
    if (!history) return [];
    if (historyFilter === 'all') return history;
    return history.filter((item: any) => item?.type === historyFilter);
  }, [history, historyFilter]);
  const { logEvent } = useLogging();

  const canUse = !!currentUser;
  const isApproved = isUserApproved(currentUser);

  useEffect(() => {
    if (!latestPlan) {
      setShowPlanBuilder(true);
    }
  }, [latestPlan]);

  // Sync restrictionsInput with intake.restrictions when editing existing plan
  useEffect(() => {
    if (intake.restrictions && intake.restrictions.length > 0) {
      setRestrictionsInput(intake.restrictions.join(', '));
    } else if (latestPlan?.restrictions && Array.isArray(latestPlan.restrictions) && latestPlan.restrictions.length > 0) {
      setRestrictionsInput(latestPlan.restrictions.join(', '));
    }
  }, [latestPlan]);

  useEffect(() => {
    if (playerSession) {
      playerDocIdRef.current = generateId();
    } else {
      playerDocIdRef.current = null;
    }
  }, [playerSession]);

  useEffect(() => {
    if (historyFilter !== 'all' && !availableTypes.includes(historyFilter)) {
      setHistoryFilter('all');
    }
  }, [availableTypes, historyFilter]);

  const csvEscape = (value: any) => {
    if (value === undefined || value === null) return '';
    const s = String(value);
    const needsQuote = /[",\n]/.test(s) || /^[=+\-@]/.test(s);
    const safe = s.replace(/"/g, '""');
    return needsQuote ? `"${safe}"` : safe;
  };

  const historyList = useMemo(() => filteredHistory.slice(0, 12), [filteredHistory]);

  const activeMemberships = useMemo(() => {
    const now = new Date();
    return (memberships || []).filter((m: any) => {
      const s = m.startAt?.toDate?.() ? m.startAt.toDate() : (m.startAt instanceof Date ? m.startAt : null);
      const e = m.endAt?.toDate?.() ? m.endAt.toDate() : (m.endAt instanceof Date ? m.endAt : null);
      if (s && now < s) return false;
      if (e && now > e) return false;
      return true;
    });
  }, [memberships]);

  const equipmentToAvailability = (list?: string[] | null) => {
    const avail: any = { bodyweight: true, dumbbells: false, bands: false, kettlebell: false, barbell: false, machines: false, bench: false, box: false, medicine_ball: false, other: false };
    (list || []).forEach((e) => {
      const key = String(e || '').toLowerCase();
      if (key.includes('dumbbell')) avail.dumbbells = true;
      if (key.includes('band')) avail.bands = true;
      if (key.includes('kettlebell')) avail.kettlebell = true;
      if (key.includes('barbell')) avail.barbell = true;
      if (key.includes('machine')) avail.machines = true;
      if (key.includes('bench')) avail.bench = true;
      if (key.includes('box')) avail.box = true;
      if (key.includes('medicine')) avail.medicine_ball = true;
      if (key.includes('none')) avail.bodyweight = true;
    });
    return avail;
  };

  const onStartNextCycle = async () => {
    if (!currentUser || !latestPlan) return;
    setLoading(true);
    try {
      const next: PlanIntake = {
        goal: (latestPlan.goal || 'general') as any,
        level: (latestPlan.level || 'beginner') as any,
        daysPerWeek: (latestPlan.daysPerWeek || 3) as any,
        minutesPerSession: (latestPlan.minutesPerSession || 20) as any,
        equipment: Array.isArray(latestPlan.equipment) ? latestPlan.equipment : ['none'],
        postpartum: !!latestPlan.postpartum,
        environment: (latestPlan.environment || 'home') as any,
        restrictions: Array.isArray(latestPlan.restrictions) ? latestPlan.restrictions : [],
      };
      await generateWorkoutPlan(next);
      toast.success('New 6-week cycle created');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to create next cycle');
    } finally {
      setLoading(false);
    }
  };

  const loadPreviews = async (session: any, key: string) => {
    const names: string[] = [];
    (session?.blocks || []).forEach((b: any) => {
      (b?.items || []).forEach((it: any) => {
        const name = stripPrescription(String(it || ''));
        if (name && !names.includes(name)) names.push(name);
      });
    });
    const limited = names.slice(0, 4);
    const results: any[] = [];
    for (const n of limited) {
      try {
        const doc = await resolveExerciseByName(n);
        if (doc) results.push(doc);
      } catch {}
    }
    setPreviewMap((m) => ({ ...m, [key]: results }));
  };

  const completedSourceKeys = useMemo(() => {
    const set = new Set<string>();
    (history || []).forEach((item: any) => {
      if (typeof item?.sourceKey === 'string' && item.sourceKey) {
        set.add(item.sourceKey);
      }
    });
    return set;
  }, [history]);

  const exportHistoryCsv = () => {
    if (!filteredHistory.length) {
      logEvent('workout_history_export_empty', { filter: historyFilter });
      toast.error('No sessions to export yet.');
      return;
    }
    if (typeof window === 'undefined') {
      console.warn('CSV export is only available in the browser.');
      return;
    }

    const headers = ['Title', 'Type', 'Minutes', 'Rounds', 'RPE', 'Notes', 'Completed At'];
    const rows = filteredHistory.map((entry: any) => {
      const completedAt =
        entry?.completedAt?.toDate && typeof entry.completedAt.toDate === 'function'
          ? entry.completedAt.toDate().toLocaleString()
          : entry?.completedAt?.seconds
          ? new Date(entry.completedAt.seconds * 1000).toLocaleString()
          : '';
      return [
        entry?.title || 'Session',
        entry?.type || '',
        entry?.minutes ?? '',
        typeof entry?.rounds === 'number' ? entry.rounds : '',
        typeof entry?.rpe === 'number' ? entry.rpe : '',
        entry?.notes ?? '',
        completedAt,
      ];
    });

    const csvLines = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

    try {
      const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filterSuffix = historyFilter !== 'all' ? `-${historyFilter}` : '';
      link.href = url;
      link.setAttribute('download', `mojo-workout-history${filterSuffix}-${dateStamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      logEvent('workout_history_exported', {
        filter: historyFilter,
        count: filteredHistory.length,
      });
      toast.success('Workout history exported.');
    } catch (error) {
      console.error(error);
      logEvent('workout_history_export_error', {
        filter: historyFilter,
        message: (error as Error)?.message || 'unknown',
      });
      toast.error('Failed to export workout history.');
    }
  };

  if (!canUse) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white/80 border border-orange-100 rounded-3xl shadow-xl px-8 py-10 text-center space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold text-[#F25129]">AI Workouts (Beta)</h1>
          <p className="text-base md:text-lg text-gray-600">
            Sign in to unlock personalized plans, daily “Today’s Mojo” suggestions, and session tracking powered by Mom Fitness Mojo AI.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold shadow-lg hover:shadow-xl transition"
            >
              Sign In to Start
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 border border-[#F25129]/40 text-[#F25129] font-semibold hover:bg-[#F25129]/5 transition"
            >
              Create an Account
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Already following along? Sign in to see your latest plan, start the Session Player, and log completions.
          </p>
        </div>
      </div>
    );
  }

  async function onCreatePlan() {
    if (!canUse) { toast.error('Please sign in'); return; }
    setLoading(true);
    try {
      const id = await generateWorkoutPlan(intake);
      toast.success('Plan created');
      logEvent('workout_plan_created', {
        planId: id,
        goal: intake.goal,
        level: intake.level,
        daysPerWeek: intake.daysPerWeek,
        minutesPerSession: intake.minutesPerSession,
        postpartum: intake.postpartum ? 1 : 0,
      });
    } catch (e:any) {
      console.error(e);
      logEvent('workout_plan_create_error', {
        goal: intake.goal,
        level: intake.level,
        message: e?.message || 'unknown',
      });
      toast.error('Failed to create plan. Please try again. [plan-create]');
    } finally {
      setLoading(false);
    }
  }

  async function onSuggest() {
    if (!canUse) { toast.error('Please sign in'); return; }
    setLoading(true);
    try {
      const suggestion = await getDailyWorkoutSuggestion(readiness as any);
      setToday(suggestion);
      toast.success('Suggestion ready');
      logEvent('workout_suggestion_success', {
        type: suggestion.type,
        minutes: suggestion.minutes,
        readiness_sleep: readiness.sleep,
        readiness_stress: readiness.stress,
        readiness_time: readiness.timeAvailable,
        readiness_soreness: readiness.soreness ?? 0,
        note: suggestion.note ? 1 : 0,
      });
    } catch (e:any) {
      console.error(e);
      logEvent('workout_suggestion_error', {
        message: e?.message || 'unknown',
        readiness_sleep: readiness.sleep,
        readiness_stress: readiness.stress,
      });
      toast.error('Failed to get suggestion. Please try again. [suggestion-fetch]');
    } finally {
      setLoading(false);
    }
  }

  async function logCompletion(payload: { title: string; type: string; minutes: number }, key: string) {
    if (!canUse) { toast.error('Please sign in'); return; }
    if (pendingLogKey && pendingLogKey !== key) {
      toast.error('Another session is currently being saved. Please wait a moment.');
      return;
    }
    if (pendingLogKey === key) return;

    const normalizedMinutes = clampMinutes(payload.minutes);
    if (normalizedMinutes <= 0) {
      toast.error('Unable to log a zero-length session.');
      return;
    }

    setPendingLogKey(key);
    const idsMap = manualDocIdsRef.current;
    const docId = idsMap.get(key) ?? generateId();
    if (!idsMap.has(key)) {
      idsMap.set(key, docId);
    }

    try {
      await setDoc(doc(db, 'users', currentUser!.id, 'sessions', docId), {
        title: payload.title,
        type: payload.type,
        minutes: normalizedMinutes,
        rpe: null,
        notes: null,
        rounds: null,
        sourceKey: key,
        completedAt: serverTimestamp(),
      });
      // Apply session credit to any active challenges (client-side assist; server also updates via trigger)
      try {
        await applySessionToActiveChallenges(currentUser!.id, { minutes: normalizedMinutes });
      } catch {}
      idsMap.delete(key);
      logEvent('workout_session_logged_manual', {
        source: key,
        type: payload.type,
        minutes: normalizedMinutes,
      });
      toast.success('Session logged');
    } catch (e:any) {
      console.error(e);
      logEvent('workout_session_log_error', {
        source: key,
        type: payload.type,
        message: e?.message || 'unknown',
      });
      toast.error('Failed to log session. Please try again. [session-manual]');
    } finally {
      setPendingLogKey(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl md:text-4xl font-bold text-[#F25129] mb-6">AI Workouts (Beta)</h1>
      {currentUser && activeMemberships && activeMemberships.length > 0 && (
        <div className="mb-6 bg-white/80 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Active Challenges</div>
              <div className="text-xs text-gray-500">Progress updates when you log sessions</div>
            </div>
            <Link to="/challenges" className="text-xs px-2 py-1 rounded border">View</Link>
          </div>
          <div className="mt-2 grid md:grid-cols-2 gap-2">
            {activeMemberships.slice(0,3).map((m:any) => {
              const goal = m.goal || 'sessions';
              const target = Math.max(1, Number(m.target||1));
              const value = goal==='minutes' ? Number(m.minutesSum||0) : Number(m.progressCount||0);
              const pct = Math.min(100, Math.round((value/target)*100));
              return (
                <div key={m.id||m.challengeId} className="p-2 rounded border bg-white/70">
                  <div className="text-sm font-medium text-gray-800">{m.title || 'Challenge'}</div>
                  <div className="text-xs text-gray-600">{goal.toUpperCase()} • {value} / {target}</div>
                  <div className="mt-1 w-full h-2 bg-gray-200 rounded"><div className="h-2 bg-[#F25129] rounded" style={{ width: pct+'%' }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Show plan builder only for approved users */}
      {isApproved && (showPlanBuilder || !latestPlan) && (
        <div className="bg-white/70 rounded-2xl shadow p-6 mb-8 border border-orange-100">
          <h2 className="text-xl font-semibold mb-4">Create Your Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Goal</label>
              <select className="w-full border rounded px-3 py-2" value={intake.goal}
                onChange={(e)=> setIntake(v=>({...v, goal: e.target.value as any}))}>
                <option value="general">General Fitness</option>
                <option value="fat_loss">Fat Loss</option>
                <option value="strength">Strength</option>
                <option value="mobility">Mobility</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Experience</label>
              <select className="w-full border rounded px-3 py-2" value={intake.level}
                onChange={(e)=> setIntake(v=>({...v, level: e.target.value as any}))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Days / Week</label>
              <select className="w-full border rounded px-3 py-2" value={intake.daysPerWeek}
                onChange={(e)=> setIntake(v=>({...v, daysPerWeek: Number(e.target.value) as any}))}>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Minutes / Session</label>
              <select className="w-full border rounded px-3 py-2" value={intake.minutesPerSession}
                onChange={(e)=> setIntake(v=>({...v, minutesPerSession: Number(e.target.value) as any}))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={45}>45</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Environment</label>
              <select className="w-full border rounded px-3 py-2" value={intake.environment || 'home'}
                onChange={(e)=> setIntake(v=>({...v, environment: e.target.value as any}))}>
                <option value="home">Home</option>
                <option value="gym">Gym</option>
                <option value="outdoors">Outdoors</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Equipment</label>
              <div className="flex flex-wrap gap-2">
                {['none','bands','dumbbells','kettlebell','bike','treadmill'].map((k) => (
                  <button key={k} type="button" onClick={()=> setIntake(v=>{
                    const has = v.equipment.includes(k as any);
                    return { ...v, equipment: has ? v.equipment.filter(x=>x!==k) as any : [...v.equipment, k as any] };
                  })}
                    className={`px-3 py-2 rounded-full text-sm border ${intake.equipment.includes(k as any) ? 'bg-[#F25129] text-white border-[#F25129]' : 'bg-white text-gray-700 border-gray-300'}`}
                  >{k}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={!!intake.postpartum} onChange={(e)=> setIntake(v=>({...v, postpartum: e.target.checked}))} />
                Postpartum / Low‑impact preference
              </label>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Restrictions (comma-separated)</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., knee pain, low back"
                value={restrictionsInput}
                onChange={(e) => {
                  setRestrictionsInput(e.target.value);
                  // Update intake restrictions by splitting on comma
                  const restrictions = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  setIntake(v => ({ ...v, restrictions }));
                }}
                onBlur={() => {
                  // Ensure restrictions are properly set when user leaves the field
                  const restrictions = restrictionsInput.split(',').map(s => s.trim()).filter(Boolean);
                  setIntake(v => ({ ...v, restrictions }));
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={loading} onClick={onCreatePlan}
              className="px-5 py-3 rounded bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold disabled:opacity-60">
              {loading ? 'Creating…' : 'Create Plan'}
            </button>
            {latestPlan && (
              <button
                type="button"
                onClick={() => setShowPlanBuilder(false)}
                className="px-5 py-3 rounded border border-gray-300 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Show "Today's Mojo" only for approved users */}
      {isApproved && (
        <div className="bg-white/70 rounded-2xl shadow p-6 border border-orange-100 mb-8">
          <h2 className="text-xl font-semibold mb-4">Today's Mojo</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Sleep</label>
            <select className="w-full border rounded px-3 py-2" value={readiness.sleep}
              onChange={(e)=> setReadiness(v=>({...v, sleep: Number(e.target.value) as any}))}>
              <option value={1}>Poor</option><option value={2}>Fair</option><option value={3}>OK</option><option value={4}>Good</option><option value={5}>Great</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Stress</label>
            <select className="w-full border rounded px-3 py-2" value={readiness.stress}
              onChange={(e)=> setReadiness(v=>({...v, stress: Number(e.target.value) as any}))}>
              <option value={1}>High</option><option value={2}>Elevated</option><option value={3}>Moderate</option><option value={4}>Low</option><option value={5}>Very Low</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Time</label>
            <select className="w-full border rounded px-3 py-2" value={readiness.timeAvailable}
              onChange={(e)=> setReadiness(v=>({...v, timeAvailable: Number(e.target.value) as any}))}>
              <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={45}>45</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Soreness</label>
            <select className="w-full border rounded px-3 py-2" value={readiness.soreness}
              onChange={(e)=> setReadiness(v=>({...v, soreness: Number(e.target.value) as any}))}>
              <option value={0}>None</option><option value={1}>Light</option><option value={2}>Moderate</option><option value={3}>High</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button disabled={loading} onClick={onSuggest}
            className="px-5 py-3 rounded bg-black text-white disabled:opacity-60">{loading ? 'Checking…' : 'Get Suggestion'}</button>
          {today && (
            <div className="text-sm text-gray-800">
              <span className="font-semibold">{today.title}</span>
              <span className="ml-2">• {today.minutes} min</span>
              <span className="ml-2 uppercase text-xs bg-gray-100 px-2 py-0.5 rounded">{today.type}</span>
              {today.note && <span className="ml-2 text-gray-500">— {today.note}</span>}
            </div>
          )}
          {today && suggestionKey && (
            <button
              onClick={()=> logCompletion({ title: today.title, type: today.type, minutes: today.minutes }, suggestionKey)}
              disabled={pendingLogKey === suggestionKey || completedSourceKeys.has(suggestionKey)}
              className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {completedSourceKeys.has(suggestionKey)
                ? 'Logged'
                : pendingLogKey === suggestionKey ? 'Logging…' : 'Log Completion'}
            </button>
          )}
          {today && (
            <button
              onClick={() => {
                logEvent('workout_session_start_player', { source: 'suggestion', type: today.type });
                setPlayerSession({ ...today, sourceKey: suggestionKey });
              }}
              className="px-4 py-2 rounded bg-[#F25129] text-white text-sm"
            >
              Start
            </button>
          )}
        </div>
        </div>
      )}

      {/* Show informational message for non-approved users */}
      {currentUser && !isApproved && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-2 text-blue-900">AI Workouts Available After Approval</h2>
          <p className="text-blue-800 mb-4">
            Once your account is approved, you'll be able to create personalized workout plans, get daily "Today's Mojo" suggestions, track your sessions, and see your progress.
          </p>
          <p className="text-sm text-blue-700">
            Your account is currently pending approval. Check your approval status on the <Link to="/pending-approval" className="underline font-medium">pending approval page</Link>.
          </p>
        </div>
      )}

      {latestPlan && isApproved && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2 gap-3">
            <h3 className="text-lg font-semibold">Your Plan</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPlanBuilder(true);
                  logEvent('workout_plan_toggle_new', { fromExisting: true });
                }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                Create New Plan
              </button>
              <button
                type="button"
                onClick={onStartNextCycle}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                Start Next Cycle
              </button>
            </div>
          </div>
          <div className="bg-white/70 rounded-xl border p-4">
            <div className="text-sm text-gray-600 mb-3">{latestPlan.title} • {latestPlan.weeks} weeks • {latestPlan.daysPerWeek} days/week</div>
            {nextAdjustment && (
              <div className="mb-3">
                <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                  Last adjustment: {nextAdjustment.suggestion} ({nextAdjustment.minutesDelta >=0 ? '+' : ''}{nextAdjustment.minutesDelta} min) • avg RPE {nextAdjustment.avgRpe}
                </div>
                {nextAdjustment.coachNote && (
                  <div className="mt-2 text-xs text-gray-600 italic max-w-xl">
                    “{nextAdjustment.coachNote}”
                  </div>
                )}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              {(latestPlan.sessions || []).slice(0, 8).map((s:any, i:number)=> {
                const planKey = `plan-${latestPlan?.id ?? 'plan'}-${i}`;
                const planCompleted = completedSourceKeys.has(planKey);
                return (
                <div key={planKey} className="p-3 rounded border bg-white/80">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-gray-600">{s.type} • {s.minutes} min</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{s.blocks?.map((b:any)=> b.name).join(', ')}</div>
                  <div className="mt-2">
                    <button
                      onClick={()=> logCompletion({ title: s.title, type: s.type, minutes: s.minutes }, planKey)}
                      disabled={pendingLogKey === planKey || planCompleted}
                      className={`px-3 py-1.5 rounded text-xs border hover:bg-gray-50 disabled:opacity-60 ${planCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}`}
                    >
                      {planCompleted ? 'Completed' : pendingLogKey === planKey ? 'Logging…' : 'Log completion'}
                    </button>
                    <button
                      onClick={() => {
                        logEvent('workout_session_start_player', { source: 'plan', type: s.type, order: i });
                        setPlayerSession({ ...s, sourceKey: planKey });
                      }}
                      className="ml-2 px-3 py-1.5 rounded text-xs bg-[#F25129] text-white"
                    >
                      Start
                    </button>
                    <button
                      onClick={() => loadPreviews(s, planKey)}
                      className="ml-2 px-3 py-1.5 rounded text-xs border"
                    >
                      Preview exercises
                    </button>
                  </div>
                  {previewMap[planKey]?.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {previewMap[planKey].map((ex) => (
                        <ExercisePreviewCard key={ex.id || ex.slug} exercise={ex} compact />
                      ))}
                    </div>
                  ) : null}
                </div>
              );})}
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={async ()=> {
                try {
                  const adj = await applyAdaptiveProgression(latestPlan.id);
                  const baseMessage = `Suggested: ${adj.suggestion} (${adj.minutesDelta >=0 ? '+' : ''}${adj.minutesDelta} min)`;
                  const fullMessage = adj.coachNote ? `${baseMessage}\n${adj.coachNote}` : baseMessage;
                  toast.success(fullMessage, { duration: 5000 });
                } catch (e:any) {
                  toast.error(e?.message || 'Adaptive check failed');
                }
              }}
              className="px-4 py-2 rounded border text-sm"
            >
              Apply Adaptive Progression
            </button>
          </div>
        </div>
      )}

      {/* Session History - Only show for approved users */}
      {currentUser && isApproved && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">Recent Sessions</h3>
          <div className="bg-white/70 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setHistoryFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    historyFilter === 'all' ? 'bg-[#F25129] text-white border-[#F25129]' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  All
                </button>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setHistoryFilter(type)}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${
                      historyFilter === type ? 'bg-[#F25129] text-white border-[#F25129]' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                onClick={exportHistoryCsv}
                disabled={!filteredHistory.length}
                className="px-3 py-1.5 rounded text-xs border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
            {historyList.length > 0 ? (
              <div className="divide-y">
                {historyList.map((h: any) => (
                  <div
                    key={h.id}
                    className="py-2 px-2 space-y-1 cursor-pointer hover:bg-gray-50 rounded"
                    onClick={() => setSelectedHistory(h)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{h.title || 'Session'}</div>
                        <div className="text-xs text-gray-600 uppercase">
                          {h.type} • {h.minutes} min{typeof h.rounds === 'number' ? ` • ${h.rounds} rounds` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 text-right">
                        {h.completedAt?.toDate?.() ? new Date(h.completedAt.toDate()).toLocaleString() : ''}
                        {typeof h.rpe === 'number' && <span className="ml-2">RPE {h.rpe}</span>}
                      </div>
                    </div>
                    {Array.isArray(h.swaps) && h.swaps.length > 0 && (
                      <div className="pl-2 text-[11px] text-gray-500">
                        Swaps: {h.swaps
                          .slice(0, 2)
                          .map((s: any) => `${String(s.from || '').split(' ')[0]}→${String(s.to || '').split(' ')[0]}`)
                          .join(', ')}
                        {h.swaps.length > 2 ? '…' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                {(history && history.length > 0) ? 'No sessions match this filter yet.' : 'No sessions logged yet.'}
              </div>
            )}
          </div>
        </div>
      )}

      {playerSession && (
        <SessionPlayer
          session={playerSession}
          onClose={()=> setPlayerSession(null)}
          onComplete={async ({ rpe, notes, rounds, blocks, swaps }) => {
            if (!currentUser || savingPlayer) return;
            setSavingPlayer(true);
            const docId = playerDocIdRef.current ?? generateId();
            try {
              await setDoc(doc(db, 'users', currentUser.id, 'sessions', docId), {
                title: playerSession.title,
                type: playerSession.type,
                minutes: clampMinutes(playerSession.minutes),
                rpe: rpe ?? null,
                notes: sanitizeNotes(notes),
                rounds: typeof rounds === 'number' ? rounds : null,
                blocks: Array.isArray(blocks) ? blocks : (playerSession.blocks || null),
                swaps: Array.isArray(swaps) && swaps.length ? swaps : null,
                sourceKey: playerSession?.sourceKey ?? null,
                completedAt: serverTimestamp(),
              });
              // If from plan, persist swapped blocks back to plan session
              try {
                const key: string | undefined = playerSession?.sourceKey || undefined;
                if (key && Array.isArray(blocks)) {
                  const lastDash = key.lastIndexOf('-');
                  const prefix = 'plan-';
                  if (key.startsWith(prefix) && lastDash > prefix.length) {
                    const indexStr = key.slice(lastDash + 1);
                    const planId = key.slice(prefix.length, lastDash);
                    const idx = parseInt(indexStr, 10);
                    if (!isNaN(idx) && planId) {
                      const planRef = doc(db, 'users', currentUser.id, 'plans', planId);
                      const { getDoc } = await import('firebase/firestore');
                      const snap = await getDoc(planRef);
                      if (snap.exists()) {
                        const data: any = snap.data() || {};
                        const arr = Array.isArray(data.sessions) ? [...data.sessions] : [];
                        if (arr[idx]) {
                          arr[idx] = { ...(arr[idx] || {}), blocks };
                          await updateDoc(planRef, { sessions: arr, updatedAt: serverTimestamp() });
                        }
                      }
                    }
                  }
                }
              } catch {}
              // Apply session credit to any active challenges (client-side assist)
              try {
                await applySessionToActiveChallenges(currentUser.id, { minutes: clampMinutes(playerSession.minutes) });
              } catch {}
              playerDocIdRef.current = generateId();
              setPlayerSession(null);
              logEvent('workout_session_logged_player', {
                type: playerSession.type,
                minutes: clampMinutes(playerSession.minutes),
                rpe: typeof rpe === 'number' ? rpe : null,
                rounds: typeof rounds === 'number' ? rounds : null,
              });
              toast.success('Session saved');
            } catch (e:any) {
              console.error(e);
              logEvent('workout_session_player_error', {
                type: playerSession.type,
                message: e?.message || 'unknown',
              });
              toast.error('Failed to save session. Please try again. [session-player]');
            } finally {
              setSavingPlayer(false);
            }
          }}
          allowEquipment={equipmentToAvailability(latestPlan?.equipment || [])}
          difficulty={latestPlan?.level}
        />
      )}

      {selectedHistory && (
        <SessionHistoryModal
          open={!!selectedHistory}
          item={selectedHistory}
          onClose={()=> setSelectedHistory(null)}
          onSave={async (updates) => {
            if (!currentUser) return;
            try {
              await updateDoc(doc(db, 'users', currentUser.id, 'sessions', selectedHistory.id), {
                title: updates.title ?? selectedHistory.title ?? 'Session',
                minutes: updates.minutes ?? selectedHistory.minutes ?? 0,
                rounds: typeof updates.rounds === 'number' ? updates.rounds : null,
                rpe: typeof updates.rpe === 'number' ? updates.rpe : null,
                notes: updates.notes ?? null,
              });
              toast.success('Session updated');
            } catch (e:any) {
              console.error(e);
              toast.error('Failed to update session');
            }
          }}
          onDelete={async () => {
            if (!currentUser) return;
            try {
              await deleteDoc(doc(db, 'users', currentUser.id, 'sessions', selectedHistory.id));
              toast.success('Session deleted');
              setSelectedHistory(null);
            } catch (e:any) {
              console.error(e);
              toast.error('Failed to delete session');
            }
          }}
        />
      )}

    </div>
  );
}


