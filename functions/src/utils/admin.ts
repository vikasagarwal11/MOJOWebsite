import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export async function ensureAdmin(auth: CallableRequest['auth'] | undefined): Promise<void> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const token = auth.token as any;
  const tokenSaysAdmin = token?.role === 'admin' || token?.admin === true;
  if (tokenSaysAdmin) {
    return;
  }

  const doc = await db.collection('users').doc(auth.uid!).get();
  if (!doc.exists) {
    throw new HttpsError('permission-denied', 'Admin only');
  }
  const data = doc.data() || {};
  if (data.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only');
  }
}

