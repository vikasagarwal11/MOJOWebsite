// src/utils/postActions.ts
import { db } from '../config/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export async function likePost(postId: string, uid: string) {
  // deterministic doc id == uid (required by rules)
  await setDoc(doc(db, 'posts', postId, 'likes', uid), {
    userId: uid,
    createdAt: serverTimestamp(),
  });
}

export async function unlikePost(postId: string, uid: string) {
  await deleteDoc(doc(db, 'posts', postId, 'likes', uid));
}

export async function addPostComment(
  postId: string,
  uid: string,
  authorName: string,
  text: string
) {
  await addDoc(collection(db, 'posts', postId, 'comments'), {
    authorId: uid,
    authorName,
    text,
    createdAt: serverTimestamp(),
  });
}
