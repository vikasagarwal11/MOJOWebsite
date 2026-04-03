import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentData, QuerySnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/** Same CORS as other callables; mobile clients typically send no Origin. */
const CORS = [
  'https://momsfitnessmojo.com',
  'https://www.momsfitnessmojo.com',
  'https://momsfitnessmojo-65d00.web.app',
  'https://momsfitnessmojo-65d00.firebaseapp.com',
  'https://momsfitnessmojo-dev.web.app',
  'https://momsfitnessmojo-dev.firebaseapp.com',
  'https://momfitnessmojo.web.app',
  'https://momfitnessmojo.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:3000',
];

export interface MemberSearchRow {
  uid: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  photoURL: string | null;
  email: string | null;
  phoneNumber: string | null;
  status: string | null;
}

function pickMember(d: DocumentData, uid: string): MemberSearchRow {
  return {
    uid,
    displayName: (d['displayName'] as string) ?? null,
    firstName: (d['firstName'] as string) ?? null,
    lastName: (d['lastName'] as string) ?? null,
    photoURL: ((d['photoURL'] ?? d['photoUrl']) as string) ?? null,
    email: (d['email'] as string) ?? null,
    phoneNumber: ((d['phoneNumber'] ?? d['phone']) as string) ?? null,
    status: (d['status'] as string) ?? null,
  };
}

function isApproved(d: DocumentData): boolean {
  const s = d['status'];
  return !s || s === 'approved';
}

function addDocs(
  snap: QuerySnapshot,
  callerUid: string,
  out: Map<string, MemberSearchRow>
): void {
  for (const doc of snap.docs) {
    if (doc.id === callerUid) continue;
    const d = doc.data();
    if (!isApproved(d)) continue;
    out.set(doc.id, pickMember(d, doc.id));
  }
}

/**
 * Server-side member discovery for DM / invite flows.
 * - Empty query: browse first [limit] users by displayNameLower.
 * - Non-empty: prefix match on displayNameLower + email (if index exists), plus digit scan for phone when query is 3+ digits.
 */
export const searchMembers = onCall(
  { region: 'us-east1', cors: CORS, timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required');
    }
    const callerUid = request.auth.uid;
    const rawQ = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
    const limit = Math.min(50, Math.max(1, Number(request.data?.limit) || 30));

    const db = getFirestore();
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const c = callerSnap.data() || {};
    if (c['status'] && c['status'] !== 'approved') {
      throw new HttpsError('permission-denied', 'Approved members only');
    }

    const q = rawQ.toLowerCase();
    const out = new Map<string, MemberSearchRow>();
    const endRange = q + '\uf8ff';

    if (q.length === 0) {
      const snap = await db
        .collection('users')
        .orderBy('displayNameLower')
        .limit(limit)
        .get();
      addDocs(snap, callerUid, out);
    } else {
      const snapName = await db
        .collection('users')
        .orderBy('displayNameLower')
        .startAt(q)
        .endAt(endRange)
        .limit(limit)
        .get();
      addDocs(snapName, callerUid, out);

      try {
        const snapEmail = await db
          .collection('users')
          .orderBy('email')
          .startAt(q)
          .endAt(endRange)
          .limit(limit)
          .get();
        addDocs(snapEmail, callerUid, out);
      } catch (e) {
        console.warn('searchMembers: email prefix query skipped (index or missing email)', e);
      }

      const digitsOnly = q.replace(/\D/g, '');
      if (digitsOnly.length >= 3) {
        const cap = await db.collection('users').orderBy('displayNameLower').limit(250).get();
        for (const doc of cap.docs) {
          if (doc.id === callerUid) continue;
          const d = doc.data();
          if (!isApproved(d)) continue;
          const phone = String(d['phoneNumber'] ?? d['phone'] ?? '');
          const pd = phone.replace(/\D/g, '');
          if (pd.includes(digitsOnly)) {
            out.set(doc.id, pickMember(d, doc.id));
          }
        }
      }
    }

    let members = Array.from(out.values());
    members.sort((a, b) => {
      const an =
        `${a.firstName || ''} ${a.lastName || ''} ${a.displayName || ''}`.toLowerCase().trim() ||
        a.uid;
      const bn =
        `${b.firstName || ''} ${b.lastName || ''} ${b.displayName || ''}`.toLowerCase().trim() ||
        b.uid;
      return an.localeCompare(bn);
    });
    members = members.slice(0, limit);

    return { members };
  }
);
