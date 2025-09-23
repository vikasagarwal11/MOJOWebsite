import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
// import { logger } from '../../utils/logger';

interface BulkAttendeeToolProps {
  eventId: string;
  eventTitle: string;
  maxAttendees: number;
  onComplete: () => void;
}

interface AttendeeData {
  userId: string | null;
  rsvpStatus: 'going' | 'not-going' | 'waitlisted';
  attendeeType: 'real' | 'ghost' | 'offline_paid' | 'vip' | 'sponsor' | 'volunteer' | 'family_member' | 'early_bird' | 'group_booking';
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

export const BulkAttendeeTool: React.FC<BulkAttendeeToolProps> = ({
  eventId,
  eventTitle,
  maxAttendees,
  onComplete
}) => {
  const [attendeeCount, setAttendeeCount] = useState<number>(102);
  const [attendeeType, setAttendeeType] = useState<'ghost' | 'offline_paid' | 'vip' | 'sponsor' | 'volunteer' | 'family_member' | 'early_bird' | 'group_booking'>('offline_paid');
  const [attendeeNames, setAttendeeNames] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');

  const generateAttendeeData = (index: number): AttendeeData => {
    // Parse names from textarea (one per line)
    const names = attendeeNames.split('\n').filter(name => name.trim() !== '');
    
    let name: string;
    if (names.length > index && names[index]) {
      name = names[index].trim();
    } else {
      // Fallback to generated names if not enough real names provided
      const baseNames = {
        'offline_paid': 'Offline Attendee',
        'ghost': 'Ghost Attendee',
        'vip': 'VIP Guest',
        'sponsor': 'Sponsor',
        'volunteer': 'Volunteer',
        'family_member': 'Family Member',
        'early_bird': 'Early Bird',
        'group_booking': 'Group Booking'
      };
      const baseName = baseNames[attendeeType] || 'Attendee';
      name = `${baseName} ${index + 1}`;
    }
    
    // Generate appropriate contact info based on type
    const getContactInfo = () => {
      switch (attendeeType) {
        case 'offline_paid':
        case 'vip':
        case 'sponsor':
        case 'early_bird':
          return {
            email: `attendee${index + 1}@example.com`,
            phone: `+1-555-${String(index + 1).padStart(4, '0')}`
          };
        case 'family_member':
          return {
            email: `family${index + 1}@example.com`,
            phone: `+1-555-${String(index + 1).padStart(4, '0')}`
          };
        case 'volunteer':
          return {
            email: `volunteer${index + 1}@example.com`,
            phone: `+1-555-${String(index + 1).padStart(4, '0')}`
          };
        case 'group_booking':
          return {
            email: `group${index + 1}@example.com`,
            phone: `+1-555-${String(index + 1).padStart(4, '0')}`
          };
        default:
          return {};
      }
    };
    
    const contactInfo = getContactInfo();
    
    return {
      userId: null, // Bulk upload attendees don't have user accounts
      rsvpStatus: 'going',
      attendeeType,
      name,
      email: contactInfo.email,
      phone: contactInfo.phone,
      notes: customNotes || (attendeeType === 'vip' ? 'VIP Guest' : 
             attendeeType === 'sponsor' ? 'Event Sponsor' :
             attendeeType === 'volunteer' ? 'Event Volunteer' :
             attendeeType === 'early_bird' ? 'Early Bird Registration' :
             attendeeType === 'group_booking' ? 'Group Booking' : undefined),
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    };
  };

  const addBulkAttendees = async () => {
    if (!eventId) {
      setStatus('Error: No event ID provided');
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setStatus('Checking existing attendees...');

    try {
      // First, check how many attendees already exist
      const attendeesRef = collection(db, 'events', eventId, 'attendees');
      const existingAttendeesQuery = query(attendeesRef, where('isDeleted', '==', false));
      const existingSnapshot = await getDocs(existingAttendeesQuery);
      const existingCount = existingSnapshot.size;
      
      console.log(`Found ${existingCount} existing attendees for event ${eventId}`);
      
      if (existingCount >= attendeeCount) {
        setStatus(`Event already has ${existingCount} attendees (target: ${attendeeCount}). No new attendees needed.`);
        setIsLoading(false);
        return;
      }
      
      const attendeesToAdd = [];
      const neededCount = attendeeCount - existingCount;
      
      setStatus(`Adding ${neededCount} new attendees (${existingCount} already exist)...`);

      // Generate attendee data for only the needed count
      for (let i = 0; i < neededCount; i++) {
        const attendeeData = generateAttendeeData(i);
        attendeesToAdd.push(attendeeData);
      }

      // Add attendees in batches of 5 to avoid Firestore limits
      const batchSize = 5;
      let addedCount = 0;

      for (let i = 0; i < attendeesToAdd.length; i += batchSize) {
        const batch = attendeesToAdd.slice(i, i + batchSize);
        
        // Add each attendee in the batch
        for (const attendee of batch) {
          await addDoc(attendeesRef, attendee);
          addedCount++;
          setProgress(Math.round((addedCount / neededCount) * 100));
          setStatus(`Adding attendee ${addedCount} of ${neededCount}...`);
        }

        // Longer delay between batches to avoid rate limiting
        if (i + batchSize < attendeesToAdd.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Update event's attendingCount to the total count
      const eventRef = doc(db, 'events', eventId);
      const totalCount = existingCount + addedCount;
      await updateDoc(eventRef, {
        attendingCount: totalCount,
        updatedAt: new Date()
      });

      setStatus(`Successfully added ${addedCount} ${attendeeType} attendees! (Total: ${existingCount + addedCount})`);
      console.log('Bulk attendees added', { eventId, count: attendeeCount, type: attendeeType });
      
      // Call completion callback
      onComplete();

    } catch (error) {
      const errorMessage = `Error adding bulk attendees: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setStatus(errorMessage);
      console.error('Bulk attendee creation failed', { eventId, error });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
      <h3 className="text-xl font-bold mb-4 text-gray-800">
        Bulk Add Attendees
      </h3>
      
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">
          Event: <span className="font-semibold">{eventTitle}</span>
        </p>
        <p className="text-sm text-gray-600">
          Max Capacity: <span className="font-semibold">{maxAttendees}</span>
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Attendees
          </label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setAttendeeCount(50)}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              disabled={isLoading}
            >
              50
            </button>
            <button
              onClick={() => setAttendeeCount(100)}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              disabled={isLoading}
            >
              100
            </button>
            <button
              onClick={() => setAttendeeCount(150)}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              disabled={isLoading}
            >
              150
            </button>
            <button
              onClick={() => setAttendeeCount(maxAttendees)}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              disabled={isLoading}
            >
              Max ({maxAttendees})
            </button>
          </div>
          <input
            type="number"
            value={attendeeCount}
            onChange={(e) => setAttendeeCount(parseInt(e.target.value) || 0)}
            min="1"
            max={maxAttendees}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Attendee Type
          </label>
          <select
            value={attendeeType}
            onChange={(e) => setAttendeeType(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="offline_paid">💰 Offline Paid (Real attendees who paid outside platform)</option>
            <option value="vip">👑 VIP Guest (Special guests, speakers, dignitaries)</option>
            <option value="sponsor">🏢 Sponsor (Event sponsors and partners)</option>
            <option value="volunteer">🤝 Volunteer (Event volunteers and helpers)</option>
            <option value="family_member">👨‍👩‍👧‍👦 Family Member (Family of existing members)</option>
            <option value="early_bird">🐦 Early Bird (Early registration attendees)</option>
            <option value="group_booking">👥 Group Booking (Group reservations)</option>
            <option value="ghost">👻 Ghost (Marketing/FOMO attendees)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Attendee Names (Optional)
          </label>
          <textarea
            value={attendeeNames}
            onChange={(e) => setAttendeeNames(e.target.value)}
            placeholder="Enter names one per line:&#10;John Smith&#10;Jane Doe&#10;Mike Johnson&#10;...&#10;&#10;Leave empty to use generated names"
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter one name per line. If you provide fewer names than the count, remaining attendees will use generated names.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Notes (Optional)
          </label>
          <input
            type="text"
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="e.g., 'Table 5', 'Special dietary needs', 'VIP seating'"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Custom notes will be added to all attendees. Leave empty to use default notes based on attendee type.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 text-center">{progress}% Complete</p>
          </div>
        )}

        {status && (
          <div className={`p-3 rounded-md text-sm ${
            status.includes('Error') ? 'bg-red-100 text-red-700' : 
            status.includes('Successfully') ? 'bg-green-100 text-green-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {status}
          </div>
        )}

        <button
          onClick={addBulkAttendees}
          disabled={isLoading || attendeeCount <= 0 || attendeeCount > maxAttendees}
          className={`w-full py-2 px-4 rounded-md font-medium ${
            isLoading || attendeeCount <= 0 || attendeeCount > maxAttendees
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Adding Attendees...' : `Add ${attendeeCount} Attendees`}
        </button>
      </div>
    </div>
  );
};
