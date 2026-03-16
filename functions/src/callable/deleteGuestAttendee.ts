import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { GuestSessionService } from '../services/guestSessionService';

interface DeleteGuestAttendeeRequest {
  sessionToken: string;
  eventId: string;
  attendeeId: string;
}

export const deleteGuestAttendee = onCall(
  { region: 'us-east1' },
  async (request: CallableRequest<DeleteGuestAttendeeRequest>) => {
    const { sessionToken, eventId, attendeeId } = request.data || {};

    if (!sessionToken || !eventId || !attendeeId) {
      throw new HttpsError('invalid-argument', 'Missing required fields: sessionToken, eventId, attendeeId');
    }

    const db = getFirestore();
    const sessionService = new GuestSessionService(db);
    const validation = await sessionService.validateSession(sessionToken);

    if (!validation.valid || !validation.session) {
      throw new HttpsError('unauthenticated', `Invalid session: ${validation.error}`);
    }

    const session = validation.session;
    const attendeeRef = db.collection('events').doc(eventId).collection('attendees').doc(attendeeId);
    const attendeeSnap = await attendeeRef.get();

    if (!attendeeSnap.exists) {
      throw new HttpsError('not-found', 'Attendee not found');
    }

    const attendee = attendeeSnap.data() || {};
    const guestEmail = String(attendee.guestEmail || '').toLowerCase();
    const guestPhone = String(attendee.guestPhone || '');
    const sessionEmail = String(session.contactInfo?.email || '').toLowerCase();
    const sessionPhone = String(session.phone || '');

    if (attendee.isGuest !== true) {
      throw new HttpsError('permission-denied', 'Only guest attendees can be removed by guest users');
    }

    if (guestEmail !== sessionEmail && guestPhone !== sessionPhone) {
      throw new HttpsError('permission-denied', 'You are not authorized to remove this attendee');
    }

    // Delete attendee doc
    await attendeeRef.delete();

    // Update guest RSVP aggregates (event_guest_rsvps + event-scoped)
    const phoneDigits = sessionPhone.replace(/[^\d]/g, '');
    const deterministicGuestId = `${eventId}_${phoneDigits}`;
    const rsvpRef = db.collection('event_guest_rsvps').doc(deterministicGuestId);
    const eventScopedRef = db.collection('events').doc(eventId).collection('guest_rsvps').doc(deterministicGuestId);

    // Firestore doesn't support function updates directly; read + write.
    const [rsvpSnap, scopedSnap] = await Promise.all([rsvpRef.get(), eventScopedRef.get()]);
    const shouldKeepAttendee = (a: any) => {
      if (!a) return false;
      if (a.attendeeId && a.attendeeId === attendeeId) return false;
      if (a.name === attendee.name && a.ageGroup === attendee.ageGroup && a.relationship === attendee.relationship) {
        return false;
      }
      return true;
    };

    if (rsvpSnap.exists) {
      const data = rsvpSnap.data() || {};
      await rsvpRef.set({
        ...data,
        attendeeIds: (data.attendeeIds || []).filter((id: string) => id !== attendeeId),
        attendees: (data.attendees || []).filter(shouldKeepAttendee),
        totalAttendees: Math.max(0, (data.totalAttendees || 0) - 1),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    if (scopedSnap.exists) {
      const data = scopedSnap.data() || {};
      await eventScopedRef.set({
        ...data,
        attendeeIds: (data.attendeeIds || []).filter((id: string) => id !== attendeeId),
        attendees: (data.attendees || []).filter(shouldKeepAttendee),
        totalAttendees: Math.max(0, (data.totalAttendees || 0) - 1),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return { success: true };
  }
);
