import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { BulkAttendeeTool } from '../components/admin/BulkAttendeeTool';
// import { logger } from '../utils/logger';

interface Event {
  id: string;
  title: string;
  maxAttendees: number;
  attendingCount: number;
  waitlistEnabled: boolean;
  waitlistLimit: number;
  startAt: Date;
  endAt: Date;
  status: string;
}

const AdminBulkAttendees: React.FC = () => {
  const { currentUser } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, orderBy('startAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startAt: doc.data().startAt?.toDate() || new Date(),
        endAt: doc.data().endAt?.toDate() || new Date(),
      })) as Event[];

      setEvents(eventsData);
      setIsLoading(false);
      console.log('Events loaded for bulk attendee tool', { count: eventsData.length });
    }, (error) => {
      console.error('Error loading events for bulk attendee tool', { error });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleBulkComplete = () => {
    setSelectedEvent(null);
    console.log('Bulk attendee operation completed');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600">Please log in to access this page.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Bulk Add Attendees
          </h1>
          <p className="text-gray-600">
            Add multiple attendees to events for sold-out events or marketing purposes.
          </p>
        </div>

        {selectedEvent ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Selected Event</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Event Title</p>
                  <p className="text-lg font-semibold">{selectedEvent.title}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Current Capacity</p>
                  <p className="text-lg font-semibold">
                    {selectedEvent.attendingCount} / {selectedEvent.maxAttendees}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Waitlist</p>
                  <p className="text-lg font-semibold">
                    {selectedEvent.waitlistEnabled ? 'Enabled' : 'Disabled'}
                    {selectedEvent.waitlistEnabled && selectedEvent.waitlistLimit > 0 && 
                      ` (Limit: ${selectedEvent.waitlistLimit})`
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Event Date</p>
                  <p className="text-lg font-semibold">
                    {selectedEvent.startAt.toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="mt-4 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                ← Back to Event Selection
              </button>
            </div>

            <BulkAttendeeTool
              eventId={selectedEvent.id}
              eventTitle={selectedEvent.title}
              maxAttendees={selectedEvent.maxAttendees}
              onComplete={handleBulkComplete}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Select an Event</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedEvent(event)}
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {event.title}
                  </h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Date:</span> {event.startAt.toLocaleDateString()}
                    </p>
                    <p>
                      <span className="font-medium">Capacity:</span> {event.attendingCount} / {event.maxAttendees}
                    </p>
                    <p>
                      <span className="font-medium">Waitlist:</span> {event.waitlistEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                    <p>
                      <span className="font-medium">Status:</span> {event.status || 'Active'}
                    </p>
                  </div>
                  <div className="mt-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Click to Select
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {events.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No events found. Create an event first.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminBulkAttendees;
