import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import type { ExerciseDoc, EquipmentFamily, MovementFamily } from '../types/exercise';

const EX_COLLECTION = 'exercises';

export async function getExerciseById(id: string): Promise<ExerciseDoc | null> {
  const ref = doc(db as any, EX_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as ExerciseDoc;
}

export async function listExercises(opts?: { take?: number; onlyPublished?: boolean }): Promise<ExerciseDoc[]> {
  const c = collection(db as any, EX_COLLECTION);
  const parts: any[] = [orderBy('canonicalName')];
  if (opts?.onlyPublished) parts.push(where('status', '==', 'published'));
  if (opts?.take) parts.push(limit(opts.take));
  const q = query(c, ...parts as any);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ExerciseDoc));
}

// Very lightweight fuzzy resolver: tries slug and synonyms exact match.
// For robust mapping we will add an admin review queue; this utility is a best-effort.
export async function resolveExerciseByName(name: string): Promise<ExerciseDoc | null> {
  const raw = (name || '').trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();

  // 1) Try direct slug match
  const bySlug = await tryFirst(EX_COLLECTION, 'slug', normalized);
  if (bySlug) return bySlug;

  // 2) Try synonyms exact contains
  const bySyn = await tryFirst(EX_COLLECTION, 'synonyms', normalized, 'array-contains');
  if (bySyn) return bySyn;

  // 3) Try canonicalName case-insensitive (requires a simple client-side check)
  const list = await listExercises({ take: 50 });
  const found = list.find((e) => e.canonicalName?.toLowerCase?.() === normalized);
  return found || null;
}

async function tryFirst(collectionName: string, field: string, value: any, op: any = '=='): Promise<ExerciseDoc | null> {
  const c = collection(db as any, collectionName);
  const q = query(c, where(field as any, op as any, value), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as any) } as ExerciseDoc;
}

export type EquipmentAvailability = Partial<Record<EquipmentFamily, boolean>>;

export async function findAlternatives(
  base: ExerciseDoc,
  opts: { allowEquipment?: EquipmentAvailability; movementFamily?: MovementFamily; difficulty?: 'beginner'|'intermediate'|'advanced' }
): Promise<ExerciseDoc[]> {
  const allow = opts.allowEquipment || {};
  const family = opts.movementFamily || base.movementFamily;
  const candidates = await listExercises({ onlyPublished: true });
  const out: ExerciseDoc[] = [];
  for (const ex of candidates) {
    if (ex.slug === base.slug) continue;
    if (ex.movementFamily !== family) continue;
    // if required equipment not available, skip
    const required = ex.requiredEquipment || [];
    const ok = required.every((eq) => allow[eq] || eq === 'bodyweight');
    if (!ok) continue;
    out.push(ex);
  }
  const desired = opts.difficulty || base.difficulty;
  const scoreDifficulty = (d?: string) => {
    if (!desired || !d) return 1;
    if (d === desired) return 0;
    return 1; // simple tie-breaker for now
  };
  out.sort((a, b) => scoreDifficulty(a.difficulty) - scoreDifficulty(b.difficulty));
  return out.slice(0, 8);
}
