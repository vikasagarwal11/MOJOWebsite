// functions/src/index.ts
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// Init
initializeApp();
const db = getFirestore();

// Gen 2 defaults
setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  cpu: 1,
  maxInstances: 10,
});

// ---------------- MEDIA counters ----------------
export const onLikeWrite = onDocumentWritten("media/{mediaId}/likes/{userId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`media/${event.params.mediaId}`)
    .update({ likesCount: FieldValue.increment(delta) });
});

export const onCommentWrite = onDocumentWritten("media/{mediaId}/comments/{commentId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`media/${event.params.mediaId}`)
    .update({ commentsCount: FieldValue.increment(delta) });
});

// ---------------- POSTS counters ----------------
export const onPostLikeWrite = onDocumentWritten("posts/{postId}/likes/{userId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`posts/${event.params.postId}`)
    .update({ likesCount: FieldValue.increment(delta) });
});

export const onPostCommentWrite = onDocumentWritten("posts/{postId}/comments/{commentId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`posts/${event.params.postId}`)
    .update({ commentsCount: FieldValue.increment(delta) });
});

// ---------------- EVENTS: RSVP counter ----------------
// Include this if your app tracks `attendingCount` on events for RSVPs with "going" status
export const onRsvpWrite = onDocumentWritten("events/{eventId}/rsvps/{userId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  const wasGoing = beforeData?.status === "going";
  const isGoing = afterData?.status === "going";
  let delta = 0;
  if (isGoing && !wasGoing) delta = 1;
  if (!isGoing && wasGoing) delta = -1;
  if (delta === 0) return;
  await db.doc(`events/${event.params.eventId}`)
    .update({ attendingCount: FieldValue.increment(delta) });
});

// ---------------- EVENTS: teaser sync ----------------
// Include this if your app uses `event_teasers` for public previews of non-public, non-past events
export const onEventTeaserSync = onDocumentWritten("events/{eventId}", async (event) => {
  const teaserRef = db.doc(`event_teasers/${event.params.eventId}`);
  // Deleted event → delete teaser
  if (!event.data?.after.exists) {
    await teaserRef.delete().catch(() => {});
    return;
  }
  const data = event.data.after.data()!;
  const isPublic = !!data.public;
  const raw = data.startAt;
  const startAtDate: Date =
    raw instanceof Timestamp ? raw.toDate() :
      typeof raw?.toDate === "function" ? raw.toDate() :
        new Date(raw);
  const isPast = startAtDate.getTime() < Date.now();
  if (isPublic || isPast) {
    await teaserRef.delete().catch(() => {});
  } else {
    await teaserRef.set({
      title: data.title || "Upcoming event",
      startAt: data.startAt,
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
});

// ---------------- EVENTS: RSVP notifications ----------------
// Enhanced RSVP notification with push notifications (FCM)
export const notifyRsvp = onDocumentWritten("events/{eventId}/rsvps/{userId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  
  // Only notify for "going" status changes
  const wasGoing = beforeData?.status === "going";
  const isGoing = afterData?.status === "going";
  
  // Skip if status didn't change to "going"
  if (!isGoing || wasGoing) return;
  
  try {
    const eventId = event.params.eventId;
    const userId = event.params.userId;
    
    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return;
    
    const eventData = eventDoc.data()!;
    const eventCreatorId = eventData.createdBy;
    
    // Don't notify if user is RSVPing to their own event
    if (eventCreatorId === userId) return;
    
    // Get user details for personalized message
    const userDoc = await db.collection('users').doc(userId).get();
    let userName = 'Member';
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      userName = userData.displayName || userData.firstName || userData.lastName || 'Member';
    }
    
    // Create Firestore notification
    await db.collection('notifications').add({
      userId: eventCreatorId,
      message: `${userName} is going to ${eventData.title}!`,
      createdAt: FieldValue.serverTimestamp(),
      eventId: eventId,
      read: false,
      type: 'rsvp',
      rsvpUserId: userId,
      rsvpStatus: 'going'
    });
    
    // Send push notification if FCM token exists
    try {
      const creatorDoc = await db.collection('users').doc(eventCreatorId).get();
      const fcmToken = creatorDoc.data()?.fcmToken;
      
      if (fcmToken) {
        const { getMessaging } = await import('firebase-admin/messaging');
        const messaging = getMessaging();
        
        await messaging.send({
          token: fcmToken,
          notification: {
            title: 'New RSVP',
            body: `${userName} is going to ${eventData.title}!`,
          },
          data: { 
            eventId,
            type: 'rsvp',
            userId: userId
          },
        });
        
        console.log(`Push notification sent to ${eventCreatorId} for event ${eventId}`);
      }
    } catch (fcmError) {
      console.warn('FCM notification failed, but Firestore notification was created:', fcmError);
    }
    
    console.log(`Notification created for event ${eventId}: ${userName} is going`);
  } catch (error) {
    console.error('Error creating RSVP notification:', error);
  }
});

// Legacy function name for backward compatibility
export const onRsvpNotification = notifyRsvp;