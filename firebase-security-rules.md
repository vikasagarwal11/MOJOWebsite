# Firebase Security Rules for Mom's Fitness Mojo

## Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null; // Allow members to read other user profiles
    }
    
    // Events collection
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow create, update, delete: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Posts collection
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == resource.data.authorId;
      allow update, delete: if request.auth != null && 
        (request.auth.uid == resource.data.authorId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // Media collection
    match /media/{mediaId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == resource.data.uploadedBy;
      allow update, delete: if request.auth != null && 
        (request.auth.uid == resource.data.uploadedBy || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // Sponsors collection
    match /sponsors/{sponsorId} {
      allow read: if request.auth != null;
      allow create, update, delete: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // RSVP subcollection
    match /events/{eventId}/rsvps/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Comments subcollections
    match /{path=**}/comments/{commentId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == resource.data.authorId;
      allow update, delete: if request.auth != null && 
        (request.auth.uid == resource.data.authorId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
  }
}
```

## Storage Security Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Media uploads
    match /media/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Profile pictures
    match /profiles/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Event images (admin only)
    match /events/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Sponsor logos (admin only)
    match /sponsors/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## Authentication Configuration
1. Enable Phone Authentication in Firebase Console
2. Add your domain to authorized domains
3. Configure reCAPTCHA for web (automatically handled)
4. Set up SMS provider (Firebase handles this automatically)

## Database Structure
```
users/
  {userId}/
    - displayName: string
    - email: string (optional)
    - role: 'admin' | 'member'
    - createdAt: timestamp
    - updatedAt: timestamp
    - photoURL: string (optional)

events/
  {eventId}/
    - title: string
    - description: string
    - date: timestamp
    - time: string
    - location: string
    - imageUrl: string (optional)
    - maxAttendees: number (optional)
    - createdBy: string (userId)
    - createdAt: timestamp
    - updatedAt: timestamp
    
    rsvps/
      {userId}/
        - status: 'going' | 'maybe' | 'not-going'
        - createdAt: timestamp

posts/
  {postId}/
    - title: string
    - content: string
    - imageUrl: string (optional)
    - authorId: string
    - authorName: string
    - createdAt: timestamp
    - updatedAt: timestamp
    - likes: array of userIds
    
    comments/
      {commentId}/
        - content: string
        - authorId: string
        - authorName: string
        - createdAt: timestamp

media/
  {mediaId}/
    - title: string
    - description: string (optional)
    - type: 'image' | 'video'
    - url: string
    - eventId: string (optional)
    - uploadedBy: string (userId)
    - uploaderName: string
    - createdAt: timestamp
    - likes: array of userIds
    
    comments/
      {commentId}/
        - content: string
        - authorId: string
        - authorName: string
        - createdAt: timestamp

sponsors/
  {sponsorId}/
    - name: string
    - logo: string
    - description: string
    - website: string (optional)
    - isActive: boolean
    - createdAt: timestamp
    
    promotions/
      {promotionId}/
        - title: string
        - description: string
        - discountCode: string (optional)
        - discountPercentage: number (optional)
        - validUntil: timestamp
        - isActive: boolean
        - imageUrl: string (optional)
```