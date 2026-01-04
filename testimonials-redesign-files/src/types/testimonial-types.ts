// Testimonial Type Definitions
// Extracted from src/types/index.ts for redesign reference

export type TestimonialStatus = 'pending' | 'published' | 'rejected';

export interface Testimonial {
  id: string;
  userId: string;
  displayName: string;
  quote: string;
  rating: number;
  status: TestimonialStatus;
  featured?: boolean;
  highlight?: string;
  avatarUrl?: string;
  toneLabel?: string;
  toneConfidence?: number;
  toneKeywords?: string[];
  createdAt: Date;
  updatedAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  publishedAt?: Date;
  // Smart metadata for search and filtering
  tags?: string[];
  searchText?: string;
  // Moderation fields
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  requiresApproval?: boolean;
  moderationReason?: string;
  moderationDetectedIssues?: string[];
  moderationPipeline?: string;
}
