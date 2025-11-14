import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type ChallengeInput = {
  title: string;
  goal: 'sessions' | 'minutes';
  target: number; // e.g., 7 sessions or 120 minutes
  startAt: number; // ms since epoch
  endAt: number;   // ms since epoch
  visibility?: 'public' | 'members';
};

const createChallengeFn = httpsCallable<ChallengeInput, { id: string }>(functions, 'createChallenge');
const joinChallengeFn = httpsCallable<{ challengeId: string }, { ok: true }>(functions, 'joinChallenge');
const incrementProgressFn = httpsCallable<{ challengeId: string; sessions?: number; minutes?: number }, { ok: true }>(functions, 'incrementChallengeProgress');
const shareCardFn = httpsCallable<{ challengeId: string }, { url: string; mediaId: string }>(functions, 'generateChallengeShareCard');

export async function createChallenge(input: ChallengeInput) {
  const res = await createChallengeFn(input);
  return res.data as { id: string };
}

export async function joinChallenge(challengeId: string) {
  const res = await joinChallengeFn({ challengeId });
  return res.data as { ok: true };
}

export async function incrementChallengeProgress(challengeId: string, payload: { sessions?: number; minutes?: number }) {
  const res = await incrementProgressFn({ challengeId, ...payload });
  return res.data as { ok: true };
}

export async function generateChallengeShareCard(challengeId: string) {
  const res = await shareCardFn({ challengeId });
  return res.data as { url: string; mediaId: string };
}

