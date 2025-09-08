import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface RSVPAttendee {
  id: string;
  eventId: string;
  userId: string;
  attendeeType: 'primary' | 'family_member' | 'guest';
  familyMemberId?: string;
  relationship: string;
  name: string;
  ageGroup: string;
  rsvpStatus: 'going' | 'not_going' | 'maybe';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventRSVPData {
  eventId: string;
  eventTitle: string;
  primaryUser: {
    id: string;
    name: string;
    email: string;
  };
  attendees: RSVPAttendee[];
  totalRSVPCount: number;
}

export class RSVPService {
  private static readonly COLLECTION_NAME = 'attendees';

  /**
   * Get RSVP data for a specific event and user
   */
  static async getEventRSVPData(eventId: string, userId: string): Promise<EventRSVPData | null> {
    try {
      // Get all attendees for this event and user
      const attendeesQuery = query(
        collection(db, this.COLLECTION_NAME),
        where('eventId', '==', eventId),
        where('userId', '==', userId),
        where('rsvpStatus', '==', 'going'), // Only get people who are going
        orderBy('createdAt', 'asc')
      );

      const attendeesSnapshot = await getDocs(attendeesQuery);
      const attendees = attendeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RSVPAttendee[];

      if (attendees.length === 0) {
        return null; // No RSVP data found
      }

      // Get event details
      const eventDoc = await getDocs(query(
        collection(db, 'events'),
        where('__name__', '==', eventId)
      ));

      if (eventDoc.empty) {
        throw new Error('Event not found');
      }

      const eventData = eventDoc.docs[0].data();

      // Find the primary user (usually the first attendee or the one with attendeeType 'primary')
      const primaryAttendee = attendees.find(a => a.attendeeType === 'primary') || attendees[0];

      return {
        eventId,
        eventTitle: eventData.title || 'Event',
        primaryUser: {
          id: userId,
          name: primaryAttendee.name,
          email: '' // Will be populated from user data if needed
        },
        attendees,
        totalRSVPCount: attendees.length
      };
    } catch (error) {
      console.error('Error fetching RSVP data:', error);
      return null;
    }
  }

  /**
   * Get RSVP data for check-in page (simplified version)
   */
  static async getCheckinRSVPData(eventId: string, userId: string): Promise<{
    eventTitle: string;
    attendees: {
      id: string;
      name: string;
      role: string;
      ageGroup: string;
      isPrimary: boolean;
    }[];
  } | null> {
    try {
      const rsvpData = await this.getEventRSVPData(eventId, userId);
      
      if (!rsvpData) {
        return null;
      }

      return {
        eventTitle: rsvpData.eventTitle,
        attendees: rsvpData.attendees.map(attendee => ({
          id: attendee.id,
          name: attendee.name,
          role: attendee.attendeeType === 'primary' ? 'Primary Member' : 
                attendee.relationship === 'spouse' ? 'Spouse' :
                attendee.relationship === 'child' ? `Child (${attendee.ageGroup})` :
                attendee.relationship,
          ageGroup: attendee.ageGroup,
          isPrimary: attendee.attendeeType === 'primary'
        }))
      };
    } catch (error) {
      console.error('Error fetching check-in RSVP data:', error);
      return null;
    }
  }
}
