import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

// Calculate available primary seats (capacity applies to primaries only)
const calculateAvailablePrimarySpots = async (eventId: string): Promise<{
  capacity: number;
  goingPrimaries: number;
  availablePrimarySpots: number;
}> => {
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }
  const eventData = eventDoc.data();
  const capacity = eventData?.maxAttendees || 0;

  const goingPrimariesSnap = await db
    .collection('events')
    .doc(eventId)
    .collection('attendees')
    .where('rsvpStatus', '==', 'going')
    .where('attendeeType', '==', 'primary')
    .get();

  const goingPrimaries = goingPrimariesSnap.size;
  const availablePrimarySpots = Math.max(0, capacity - goingPrimaries);

  return { capacity, goingPrimaries, availablePrimarySpots };
};

// Calculate effective capacity (legacy - unused)
const calculateEffectiveCapacity = async (eventId: string): Promise<{
  capacity: number;
  totalGoing: number;
  overage: number;
  effectiveCapacity: number;
}> => {
  try {
    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }
    
    const eventData = eventDoc.data();
    const capacity = eventData?.maxAttendees || 0;
    
    // Get all attendees
    const attendeesSnapshot = await db.collection('events').doc(eventId)
      .collection('attendees').get();
    
    let totalGoing = 0;
    let overageByUser = new Map<string, number>();
    
    // Calculate going count and overage
    attendeesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.rsvpStatus === 'going') {
        if (data.attendeeType === 'primary') {
          totalGoing++;
          overageByUser.set(data.userId, 1);
        } else if (data.attendeeType === 'family_member') {
          const currentOverage = overageByUser.get(data.userId) || 0;
          overageByUser.set(data.userId, currentOverage + 1);
        }
      }
    });
    
    // Calculate total overage (only count overage beyond capacity for each user)
    const overage = Array.from(overageByUser.values())
      .reduce((total, userCount) => total + Math.max(0, userCount - capacity), 0);
    
    const effectiveCapacity = capacity + overage;
    
    return {
      capacity,
      totalGoing: Array.from(overageByUser.values()).reduce((sum, count) => sum + count, 0),
      overage,
      effectiveCapacity
    };
  } catch (error) {
    console.error('Error calculating effective capacity:', error);
    throw error;
  }
};

// Cloud Function version of auto-promotion service
export const triggerAutomaticPromotions = async (eventId: string): Promise<{
  success: boolean;
  promotionsCount: number;
  promotedUsers: Array<{
    userId: string;
    attendeeId: string;
    name: string;
    promotedFromPosition: number;
    message: string;
  }>;
  errors: string[];
}> => {
  try {
    console.log(`🚀 Starting auto-promotion for event: ${eventId}`);
    
    // Get available primary spots (capacity applies to primaries only)
    const { availablePrimarySpots } = await calculateAvailablePrimarySpots(eventId);
    
    if (availablePrimarySpots <= 0) {
      return {
        success: true,
        promotionsCount: 0,
        promotedUsers: [],
        errors: ['No primary spots available for promotion']
      };
    }
    
    // Get waitlisted attendees in position order
    const waitlistSnapshot = await db.collection('events').doc(eventId)
      .collection('attendees')
      .where('rsvpStatus', '==', 'waitlisted')
      .where('attendeeType', '==', 'primary')
      .orderBy('waitlistPosition', 'asc')
      .get();
    
    if (waitlistSnapshot.empty) {
      return {
        success: true,
        promotionsCount: 0,
        promotedUsers: [],
        errors: ['No waitlisted users to promote']
      };
    }
    
    // Create batch for atomic promotions
    const batch = db.batch();
    const promotions: Array<{
      userId: string;
      attendeeId: string;
      name: string;
      promotedFromPosition: number;
      message: string;
    }> = [];
    
    let spotsToFill = Math.min(availablePrimarySpots, waitlistSnapshot.size);
    let promotionNumber = 1;
    
    // Promote users up to available spots
    for (let i = 0; i < spotsToFill; i++) {
      const doc = waitlistSnapshot.docs[i];
      const attendeeData = doc.data();
      const attendeeId = doc.id;
      
      try {
        // Promote primary attendee
        batch.update(doc.ref, {
          rsvpStatus: 'going',
          waitlistPosition: null,
          promotedFromWaitlist: true,
          promotedAt: new Date(),
          promotionNumber: promotionNumber,
          updatedAt: new Date()
        });
        
        promotions.push({
          userId: attendeeData.userId,
          attendeeId: attendeeId,
          name: attendeeData.name,
          promotedFromPosition: attendeeData.waitlistPosition || 0,
          message: `✅ ${attendeeData.name} promoted from waitlist position ${attendeeData.waitlistPosition || 0}`
        });
        
        // Find and promote family members
        const familyMembersSnapshot = await db.collection('events').doc(eventId)
          .collection('attendees')
          .where('rsvpStatus', '==', 'waitlisted')
          .where('userId', '==', attendeeData.userId)
          .where('attendeeType', '==', 'family_member')
          .get();
        
        let familyPromotionNumber = promotionNumber + 1;
        
        familyMembersSnapshot.docs.forEach(familyDoc => {
          const familyData = familyDoc.data();
          
          batch.update(familyDoc.ref, {
            rsvpStatus: 'going',
            waitlistPosition: null,
            promotedFromWaitlist: true,
            promotedAt: new Date(),
            promotionNumber: familyPromotionNumber,
            updatedAt: new Date()
          });
          
          promotions.push({
            userId: familyData.userId,
            attendeeId: familyDoc.id,
            name: familyData.name,
            promotedFromPosition: familyData.waitlistPosition || 0,
            message: `👨‍👩‍👧‍👦 ${familyData.name} (family member) promoted`
          });
          
          familyPromotionNumber++;
        });
        
        promotionNumber = familyPromotionNumber;
        // Capacity counts primaries only; do not decrement for family members
        // Keep spotsToFill unchanged here
        
      } catch (error) {
        console.error(`❌ Failed to promote ${attendeeData.name}:`, error);
      }
    }
    
    // Recalculate remaining waitlist positions
    const remainingWaitlistSnapshot = await db.collection('events').doc(eventId)
      .collection('attendees')
      .where('rsvpStatus', '==', 'waitlisted')
      .where('attendeeType', '==', 'primary')
      .orderBy('originalWaitlistJoinedAt', 'asc')
      .get();
    
    let newPosition = 1;
    
    remainingWaitlistSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        waitlistPosition: newPosition,
        updatedAt: new Date()
      });
      newPosition++;
    });
    
    // Commit all updates atomically
    await batch.commit();
    
    console.log(`✅ Auto-promotion completed: ${promotions.length} users promoted`);
    
    return {
      success: true,
      promotionsCount: promotions.length,
      promotedUsers: promotions,
      errors: []
    };
    
  } catch (error) {
    console.error('🚨 Auto-promotion failed:', error);
    return {
      success: false,
      promotionsCount: 0,
      promotedUsers: [],
      errors: [error instanceof Error ? error.message : 'Unknown error in auto-promotion']
    };
  }
};

// Manual recalculation for admin tools
export const manualRecalculateWaitlistPositions = async (eventId: string): Promise<void> => {
  try {
    const snap = await db
      .collection('events')
      .doc(eventId)
      .collection('attendees')
      .where('rsvpStatus', '==', 'waitlisted')
      .get();

    // Sort with fallbacks when timestamp fields are missing
    const ordered = snap.docs.slice().sort((a, b) => {
      const ad = a.data() as any;
      const bd = b.data() as any;
      const aTime: Timestamp | null = ad.originalWaitlistJoinedAt || ad.waitlistJoinedAt || null;
      const bTime: Timestamp | null = bd.originalWaitlistJoinedAt || bd.waitlistJoinedAt || null;
      const aMs = aTime ? aTime.toMillis() : a.createTime.toMillis();
      const bMs = bTime ? bTime.toMillis() : b.createTime.toMillis();
      return aMs - bMs;
    });

    const batch = db.batch();
    ordered.forEach((doc, index) => {
      batch.update(doc.ref, {
        waitlistPosition: index + 1,
        updatedAt: new Date(),
      });
    });
    await batch.commit();
    console.log(`Manual recalculation: ${ordered.length} waitlisted attendees`);
  } catch (error) {
    console.error('Error in manual recalculation:', error);
    throw error;
  }
};
