import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type ChallengeCategory = 'exercise' | 'nutrition' | 'lifestyle' | 'wellness' | 'custom';

export type ChallengeType = 
  // Exercise
  | 'workout_sessions' | 'workout_minutes' | 'steps' | 'distance'
  // Nutrition
  | 'healthy_meals' | 'water_intake' | 'no_sugar' | 'vegetarian_days' | 'meal_prep'
  // Lifestyle
  | 'meditation' | 'sleep_hours' | 'gratitude' | 'reading' | 'screen_time'
  // Wellness
  | 'self_care' | 'social_connection' | 'outdoor_time'
  // Custom
  | 'custom';

export type ChallengeInput = {
  title: string;
  category: ChallengeCategory;
  type: ChallengeType;
  target: number;
  unit: string; // e.g., 'sessions', 'minutes', 'meals', 'days', 'glasses'
  startAt: number; // ms since epoch
  endAt: number;   // ms since epoch
  description?: string;
  instructions?: string;
  visibility?: 'public' | 'members';
  // Legacy support - will be mapped to new structure
  goal?: 'sessions' | 'minutes'; // Deprecated, use type instead
};

const createChallengeFn = httpsCallable<ChallengeInput, { id: string }>(functions, 'createChallenge');
const joinChallengeFn = httpsCallable<{ challengeId: string }, { ok: true }>(functions, 'joinChallenge');
const incrementProgressFn = httpsCallable<{ challengeId: string; value?: number; count?: number }, { ok: true }>(functions, 'incrementChallengeProgress');
const shareCardFn = httpsCallable<{ challengeId: string }, { url: string; mediaId: string }>(functions, 'generateChallengeShareCard');
const logCheckInFn = httpsCallable<{ challengeId: string; value?: number; count?: number; note?: string }, { ok: true }>(functions, 'logChallengeCheckIn');

export async function createChallenge(input: ChallengeInput) {
  const res = await createChallengeFn(input);
  return res.data as { id: string };
}

export async function joinChallenge(challengeId: string) {
  const res = await joinChallengeFn({ challengeId });
  return res.data as { ok: true };
}

export async function incrementChallengeProgress(challengeId: string, payload: { value?: number; count?: number; sessions?: number; minutes?: number }) {
  // Support both old format (sessions/minutes) and new format (value/count)
  const newPayload: { challengeId: string; value?: number; count?: number } = { challengeId };
  
  if (payload.value !== undefined) {
    newPayload.value = payload.value;
  } else if (payload.count !== undefined) {
    newPayload.count = payload.count;
  } else if (payload.sessions !== undefined) {
    // Legacy: sessions maps to count
    newPayload.count = payload.sessions;
  } else if (payload.minutes !== undefined) {
    // Legacy: minutes maps to value
    newPayload.value = payload.minutes;
  }
  
  const res = await incrementProgressFn(newPayload);
  return res.data as { ok: true };
}

export async function generateChallengeShareCard(challengeId: string) {
  const res = await shareCardFn({ challengeId });
  return res.data as { url: string; mediaId: string };
}

export async function logChallengeCheckIn(challengeId: string, payload: { value?: number; count?: number; note?: string }) {
  const res = await logCheckInFn({ challengeId, ...payload });
  return res.data as { ok: true };
}
