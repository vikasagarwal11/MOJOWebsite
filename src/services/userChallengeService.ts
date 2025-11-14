import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { incrementChallengeProgress } from './challengeService';

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any).toDate === 'function') {
    try { return (value as any).toDate(); } catch { return null; }
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}

export async function applySessionToActiveChallenges(userId: string, params: { minutes: number }) {
  const now = new Date();
  const minutes = Math.max(0, Math.round(params.minutes || 0));
  const c = collection(db as any, 'users', userId, 'challengeMemberships');
  const snap = await getDocs(c);
  const tasks: Promise<any>[] = [];
  snap.forEach((docSnap) => {
    const data: any = docSnap.data() || {};
    const startAt = toDate(data.startAt);
    const endAt = toDate(data.endAt);
    if (startAt && now < startAt) return;
    if (endAt && now > endAt) return;

    const goal: 'sessions' | 'minutes' = data.goal || 'sessions';
    if (goal === 'minutes') {
      if (minutes <= 0) return;
      tasks.push(incrementChallengeProgress(docSnap.id, { minutes }));
    } else {
      tasks.push(incrementChallengeProgress(docSnap.id, { sessions: 1 }));
    }
  });
  if (tasks.length) await Promise.allSettled(tasks);
}
