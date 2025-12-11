export type UserStatus = 'pending' | 'approved' | 'rejected' | 'needs_clarification';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phoneNumber?: string;
  photoURL?: string;
  role: 'admin' | 'trainer' | 'member';
  canEditExercises?: boolean;
  createdAt: Date;
  updatedAt: Date;
  // VIP Tier System
  membershipTier?: 'free' | 'basic' | 'premium' | 'vip';
  membershipExpiresAt?: Date;
  eventHistory?: number; // Number of events attended
  joinDate?: Date;
  // Account Approval Workflow
  status?: UserStatus; // Approval status, defaults to 'approved' for existing users
  approvalRequestedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string; // Admin user ID who approved
  rejectedAt?: Date;
  rejectedBy?: string; // Admin user ID who rejected
  rejectionReason?: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  location: string;
  imageUrl?: string;
  maxAttendees?: number;
  waitlistEnabled?: boolean;
  waitlistLimit?: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  rsvps: RSVP[];
  attendees: string[];
}

export interface RSVP {
  userId: string;
  userName: string;
  status: 'going' | 'maybe' | 'not-going';
  createdAt: Date;
}

export interface MediaFile {
  id: string;
  title: string;
  description?: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  eventId?: string;
  eventTitle?: string;
  uploadedBy: string;
  uploaderName: string;
  createdAt: Date;
  likes: string[];
  comments: Comment[];
}

export interface Post {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  createdAt: Date;
  updatedAt: Date;
  likes: string[];
  comments: Comment[];
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  createdAt: Date;
}

export interface Sponsor {
  id: string;
  name: string;
  logo: string;
  description: string;
  website?: string;
  promotions: Promotion[];
  isActive: boolean;
  createdAt: Date;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  discountCode?: string;
  discountPercentage?: number;
  validUntil: Date;
  isActive: boolean;
  imageUrl?: string;
}

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
  // Moderation fields
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  requiresApproval?: boolean;
  moderationReason?: string;
  moderationDetectedIssues?: string[];
  moderationPipeline?: string;
}

export interface TestimonialAIPrompts {
  id: string;
  communityContext: string;
  guidelines: string;
  exampleActivities: string[];
  exampleEvents: string[];
  tone: string;
  updatedAt: Date;
  updatedBy?: string;
}

export interface PostAIPrompts {
  id: string;
  communityContext: string;
  guidelines: string;
  exampleTopics: string[];
  examplePostTypes: string[];
  tone: string;
  updatedAt: Date;
  updatedBy?: string;
}

// Account Approval Types
export type AccountApprovalStatus = 'pending' | 'approved' | 'rejected' | 'needs_clarification';

export interface AccountApproval {
  id: string;
  userId: string; // References users/{userId}
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  location?: string;
  howDidYouHear?: string;
  howDidYouHearOther?: string; // If howDidYouHear === 'other'
  referredBy?: string; // User ID of referring member
  referralNotes?: string; // Additional notes from user
  status: AccountApprovalStatus;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string; // Admin user ID
  rejectionReason?: string;
  adminNotes?: string; // Internal admin notes
  awaitingResponseFrom?: 'admin' | 'user' | null; // Track who needs to respond
  lastMessageAt?: Date; // Last message timestamp
  unreadCount?: {
    admin: number; // Unread messages for admin
    user: number; // Unread messages for user
  };
}

export interface ApprovalMessage {
  id: string;
  approvalId: string; // References accountApprovals/{approvalId}
  userId: string; // User who sent the message
  senderRole: 'admin' | 'user';
  senderName: string; // Display name of sender
  message: string; // Message content
  createdAt: Date;
  read: boolean; // Whether recipient has read it
  readAt?: Date;
  attachments?: string[]; // Optional file attachments (e.g., screenshots, documents)
}

// Re-export payment types
export * from './payment';
