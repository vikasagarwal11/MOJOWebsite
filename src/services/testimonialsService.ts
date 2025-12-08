import { addDoc, collection, serverTimestamp, updateDoc, doc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { TestimonialStatus } from '../types';
import { classifyTestimonialTone } from './testimonialAIService';
import { ContentModerationService } from './contentModerationService';

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

  try {
    const toneResult = await classifyTestimonialTone(quote);
    if (toneResult.success && toneResult.label) {
      payload.toneLabel = toneResult.label;
      if (typeof toneResult.confidence === 'number') {
        payload.toneConfidence = Math.max(0, Math.min(1, toneResult.confidence));
      }
      if (toneResult.keywords && toneResult.keywords.length > 0) {
        payload.toneKeywords = toneResult.keywords.slice(0, 5);
      }
    }
  } catch (error) {
    console.warn('[testimonialsService] Tone classification failed, continuing without tone label.', error);
  }

  // Run content moderation
  try {
    const moderationResult = await ContentModerationService.moderateContent(
      quote + (highlight ? ' ' + highlight : ''),
      'testimonial',
      userId
    );

    // If content is blocked, throw error
    if (moderationResult.isBlocked) {
      throw new Error(moderationResult.reason || 'Your testimonial was blocked due to inappropriate content.');
    }

    // Set status based on moderation result
    // 'pending' if requires approval, otherwise keep as 'pending' (admin will review)
    // We use 'pending' status for testimonials that need approval
    if (moderationResult.requiresApproval) {
      payload.status = 'pending';
    } else {
      // Auto-approved testimonials can be set to 'pending' for admin review anyway
      // or you could set to 'published' if you want auto-publish
      payload.status = 'pending'; // Keep as pending for admin review
    }

    // Add moderation metadata
    payload.moderationStatus = moderationResult.requiresApproval ? 'pending' : 'approved';
    payload.requiresApproval = moderationResult.requiresApproval;
    payload.moderationReason = moderationResult.reason;
    payload.moderationDetectedIssues = moderationResult.detectedIssues;
  } catch (error: any) {
    // If it's a blocked content error, re-throw it
    if (error.message && error.message.includes('blocked')) {
      throw error;
    }
    console.warn('[testimonialsService] Moderation failed, continuing with pending status.', error);
    // Default to pending if moderation fails
    payload.status = 'pending';
    payload.moderationStatus = 'pending';
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
