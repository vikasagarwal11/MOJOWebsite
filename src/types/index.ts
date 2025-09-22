export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phoneNumber?: string;
  photoURL?: string;
  role: 'admin' | 'member';
  createdAt: Date;
  updatedAt: Date;
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

// Re-export payment types
export * from './payment';