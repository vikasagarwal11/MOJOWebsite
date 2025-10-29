import { addDoc, collection, serverTimestamp, updateDoc, doc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { TestimonialStatus } from '../types';

export interface SubmitTestimonialInput {
  userId: string;
  displayName: string;
  quote: string;
  rating: number;
  highlight?: string;
  avatarUrl?: string;
}

export async function submitTestimonial(input: SubmitTestimonialInput) {
  const { userId, displayName, quote, rating, highlight, avatarUrl } = input;

  const sanitizedRating = Math.min(5, Math.max(1, Math.round(rating)));

  const payload: Record<string, any> = {
    userId,
    displayName: displayName.trim(),
    quote: quote.trim(),
    rating: sanitizedRating,
    status: 'pending',
    featured: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (highlight && highlight.trim().length > 0) {
    payload.highlight = highlight.trim();
  }

  if (avatarUrl) {
    payload.avatarUrl = avatarUrl;
  }

  await addDoc(collection(db, 'testimonials'), payload);
}

export interface AdminUpdateTestimonialInput {
  status?: TestimonialStatus;
  featured?: boolean;
  quote?: string;
  rating?: number;
  displayName?: string;
  highlight?: string | null;
  avatarUrl?: string | null;
  reviewerId?: string | null;
}

export async function adminUpdateTestimonial(testimonialId: string, updates: AdminUpdateTestimonialInput) {
  const testimonialRef = doc(db, 'testimonials', testimonialId);
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.status) {
    payload.status = updates.status;
    payload.reviewedBy = updates.reviewerId ?? null;
    payload.reviewedAt = serverTimestamp();
    payload.publishedAt = updates.status === 'published' ? serverTimestamp() : null;
  }

  if (typeof updates.featured === 'boolean') {
    payload.featured = updates.featured;
  }

  if (updates.quote !== undefined) {
    payload.quote = updates.quote;
  }

  if (updates.rating !== undefined) {
    payload.rating = updates.rating;
  }

  if (updates.displayName !== undefined) {
    payload.displayName = updates.displayName;
  }

  if (updates.highlight !== undefined) {
    payload.highlight = updates.highlight === null ? deleteField() : updates.highlight;
  }

  if (updates.avatarUrl !== undefined) {
    payload.avatarUrl = updates.avatarUrl === null ? deleteField() : updates.avatarUrl;
  }

  await updateDoc(testimonialRef, payload);
}

export async function deleteTestimonial(testimonialId: string) {
  await deleteDoc(doc(db, 'testimonials', testimonialId));
}
