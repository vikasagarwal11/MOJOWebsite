// src/utils/mediaActions.ts
import { doc, setDoc, deleteDoc, serverTimestamp, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function likeMedia(mediaId: string, uid: string) {
  const ref = doc(db, 'media', mediaId, 'likes', uid);
  await setDoc(ref, { userId: uid, createdAt: serverTimestamp() }, { merge: false });
}

export async function unlikeMedia(mediaId: string, uid: string) {
  const ref = doc(db, 'media', mediaId, 'likes', uid);
  await deleteDoc(ref);
}

export async function getMyLike(mediaId: string, uid: string) {
  const ref = doc(db, 'media', mediaId, 'likes', uid);
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function addComment(mediaId: string, authorId: string, authorName: string, text: string) {
  // IMPORTANT: only the keys allowed by your rules.
  await addDoc(collection(db, 'media', mediaId, 'comments'), {
    authorId,
    authorName,
    text,
    createdAt: serverTimestamp(),
  });
}
