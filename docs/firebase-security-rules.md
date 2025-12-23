# Firebase Security Rules for Mom's Fitness Mojo

## Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // --- Helpers ---
    function isSignedIn() { return request.auth != null; }
    function userDoc() {
      return isSignedIn()
        ? get(/databases/$(database)/documents/users/$(request.auth.uid)).data
        : null;
    }
    function isAdmin() { return userDoc() != null && userDoc().role == 'admin'; }
    function isMember() { return userDoc() != null && userDoc().role == 'member'; }
    // Phone number from the auth token (E.164 like +12125550123) or null
    function tokenPhone() { return isSignedIn() ? request.auth.token.phone_number : null; }
    // Block specific phone number from creating role: "member" (E.164 format)
    function isBlockedPhone() { return tokenPhone() == "+10000000000"; }
    function isNonEmptyString(v) { return v is string && v.size() > 0; }
    function isUrlLike(v) { return v is string && v.size() <= 2048 && v.matches('https?://.*'); }
    // Address validation: optional, but city/state required if present
    function validAddress(m) {
      return m is map
        && ('city' in m) && isNonEmptyString(m.city)
        && ('state' in m) && isNonEmptyString(m.state)
        && (!('street' in m) || m.street is string)
        && (!('postalCode' in m) || m.postalCode is string);
    }
    // Social links: optional, only known keys, URL-like values
    function validSocial(m) {
      return m is map
        && m.keys().hasOnly(['instagram','facebook','twitter','tiktok','youtube','website'])
        && (!('instagram' in m) || isUrlLike(m.instagram))
        && (!('facebook' in m) || isUrlLike(m.facebook))
        && (!('twitter' in m) || isUrlLike(m.twitter))
        && (!('tiktok' in m) || isUrlLike(m.tiktok))
        && (!('youtube' in m) || isUrlLike(m.youtube))
        && (!('website' in m) || isUrlLike(m.website));
    }
    // Profile fields: all optional except address city/state if present
    function validUserProfileData(newData) {
      return
        (!('displayName' in newData) || isNonEmptyString(newData.displayName)) &&
        (!('email' in newData) || newData.email is string) && // UI should validate format
        (!('photoURL' in newData) || isUrlLike(newData.photoURL)) &&
        (!('about' in newData) || (newData.about is string && newData.about.size() <= 1000)) &&
        (!('age' in newData) || (newData.age is number && newData.age >= 13 && newData.age <= 120)) &&
        (!('address' in newData) || validAddress(newData.address)) &&
        (!('social' in newData) || validSocial(newData.social));
    }
    
    // --- USERS ---
    match /users/{userId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
                    && request.auth.uid == userId
                    && (!('role' in request.resource.data)
                        || (request.resource.data.role == 'member' && !isBlockedPhone()))
                    && validUserProfileData(request.resource.data);
      allow update: if isSignedIn()
                    && request.auth.uid == userId
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
                    && validUserProfileData(request.resource.data);
      allow delete: if isSignedIn() && request.auth.uid == userId;
    }
    
    // --- EVENT TEASERS (Public, lightweight view of upcoming events) ---
    match /event_teasers/{teaserId} {
      allow read: if true; // public
      allow create, update, delete: if isAdmin();
    }
    
    // --- EVENTS (Public for past events; signed-in for upcoming unless public) ---
    match /events/{eventId} {
      allow read: if
        !('startAt' in resource.data) || // legacy safety
        resource.data.startAt < request.time || // past event
        isSignedIn() || // any signed-in user
        (('public' in resource.data) && resource.data.public == true); // explicitly public
      allow create, update, delete: if isAdmin()
        && (!('public' in request.resource.data) || (request.resource.data.public is bool));
      match /rsvps/{userId} {
        allow read: if isSignedIn();
        allow create: if (isMember() || isAdmin())
                      && request.auth.uid == userId
                      && request.resource.data.keys().hasOnly(['status','createdAt'])
                      && request.resource.data.status in ['going','maybe','not-going'];
        allow update: if (isMember() || isAdmin())
                      && request.auth.uid == userId
                      && request.resource.data.diff(resource.data).changedKeys().hasOnly(['status','updatedAt'])
                      && request.resource.data.status in ['going','maybe','not-going'];
        allow delete: if isMember() && request.auth.uid == userId;
      }
    }
    
    // --- POSTS (Public if isPublic; members/admins can create) ---
    match /posts/{postId} {
      allow read: if
        (('isPublic' in resource.data) && resource.data.isPublic == true) ||
        isMember() || isAdmin();
      allow create: if isSignedIn()
                    && (isMember() || isAdmin())
                    && request.auth.uid == request.resource.data.authorId;
      allow update, delete: if isSignedIn()
                            && (request.auth.uid == resource.data.authorId || isAdmin());
      match /likes/{userId} {
        allow read: if true;
        allow create: if (isMember() || isAdmin())
                      && request.auth.uid == userId
                      && request.resource.data.keys().hasOnly(['userId','createdAt'])
                      && request.resource.data.userId == userId;
        allow update: if false;
        allow delete: if (isMember() || isAdmin())
                      && (request.auth.uid == userId || isAdmin());
      }
      match /comments/{commentId} {
        allow read: if true;
        allow create: if isSignedIn() // Any signed-in user can comment (reverted to existing for broader access)
                      && request.auth.uid == request.resource.data.authorId
                      && isNonEmptyString(request.resource.data.text)
                      && request.resource.data.text.size() <= 1000
                      && request.resource.data.keys().hasOnly(['authorId','authorName','text','createdAt']);
        allow update: if isSignedIn()
                      && (request.auth.uid == resource.data.authorId || isAdmin())
                      && request.resource.data.diff(resource.data).changedKeys().hasOnly(['text','updatedAt']);
        allow delete: if isSignedIn()
                      && (request.auth.uid == resource.data.authorId || isAdmin());
      }
    }
    
    // --- MEDIA (Public if isPublic; uploader or admin can write) ---
    match /media/{mediaId} {
      allow read: if (resource.data.isPublic == true) || isMember() || isAdmin();
      allow create: if isSignedIn() && request.auth.uid == request.resource.data.uploadedBy;
      allow update, delete: if isSignedIn()
                            && (request.auth.uid == resource.data.uploadedBy || isAdmin());
      match /likes/{userId} {
        allow read: if true;
        allow create: if (isMember() || isAdmin())
                      && request.auth.uid == userId
                      && request.resource.data.keys().hasOnly(['userId','createdAt'])
                      && request.resource.data.userId == userId;
        allow update: if false;
        allow delete: if (isMember() || isAdmin())
                      && (request.auth.uid == userId || isAdmin());
      }
      match /comments/{commentId} {
        allow read: if true;
        allow create: if (isMember() || isAdmin())
                      && request.auth.uid == request.resource.data.authorId
                      && isNonEmptyString(request.resource.data.text)
                      && request.resource.data.text.size() <= 1000
                      && request.resource.data.keys().hasOnly(['authorId','authorName','text','createdAt']);
        allow update: if (isMember() || isAdmin())
                      && (request.auth.uid == resource.data.authorId || isAdmin())
                      && request.resource.data.diff(resource.data).changedKeys().hasOnly(['text','updatedAt']);
        allow delete: if (isMember() || isAdmin())
                      && (request.auth.uid == resource.data.authorId || isAdmin());
      }
    }
    
    // --- SPONSORS (Public read) + promotions ---
    match /sponsors/{sponsorId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
      match /promotions/{promotionId} {
        allow read: if true;
        allow create, update, delete: if isAdmin();
      }
    }
    
    // --- NOTIFICATIONS (Only Cloud Functions can write, users can read their own) ---
    match /notifications/{notificationId} {
      allow read: if isSignedIn() && request.auth.uid == resource.data.userId;
      allow write: if false; // Only Cloud Functions can write notifications
    }
    
    // --- Fallback for stray comments ---
    match /{parentPath=**}/comments/{commentId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
                    && request.auth.uid == request.resource.data.authorId
                    && isNonEmptyString(request.resource.data.text)
                    && request.resource.data.text.size() <= 1000;
      allow update, delete: if isSignedIn()
                            && (request.auth.uid == resource.data.authorId || isAdmin());
    }
  }
}
```

## Storage Security Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Helpers
    function isSignedIn() { return request.auth != null; }
    // Reads the caller's user doc to check role (incurs a Firestore read)
    function isAdmin() {
      return isSignedIn() &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    function isImage() {
      return request.resource.contentType.matches('image/.*')
        || request.resource.name.matches('.*\\.(jpg|jpeg|png|gif|webp)$');
    }
    
    // =========================
    // User media uploads: media/{uid}/...
    // =========================
    match /media/{userId}/{allPaths=**} {
      allow read: if true; // or isSignedIn() if you prefer private reads
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 50 * 1024 * 1024 // < 50MB
                   && (request.resource.contentType.matches('image/.*')
                       || request.resource.contentType.matches('video/.*')
                       || request.resource.contentType.matches('audio/.*'));
    }
    
    // =========================
    // Profile pictures: profiles/{uid}/{fileName}
    // =========================
    match /profiles/{userId}/{fileName} {
      allow read: if true;
      allow write: if isSignedIn()
                   && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024 // < 5MB
                   && isImage();
    }
    
    // =========================
    // Event images (admins only): events/{...}
    // =========================
    match /events/{fileName=**} {
      allow read: if true;
      allow write: if isAdmin()
                   && request.resource.size < 10 * 1024 * 1024 // < 10MB
                   && isImage();
    }
    
    // =========================
    // Sponsor logos (admins only): sponsors/{...}
    // =========================
    match /sponsors/{fileName=**} {
      allow read: if true;
      allow write: if isAdmin()
                   && request.resource.size < 5 * 1024 * 1024 // < 5MB
                   && isImage();
    }
    
    // Fallback: deny anything not matched above
    match /{path=**} {
      allow read, write: if false;
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

notifications/
  {notificationId}/
    - userId: string (recipient's user ID)
    - message: string (notification text)
    - createdAt: timestamp
    - eventId: string (optional, links to event)
    - read: boolean (read status)
    - type: string (e.g., 'rsvp')
    - rsvpUserId: string (optional, who RSVP'd)
    - rsvpStatus: string (optional, RSVP status)
```