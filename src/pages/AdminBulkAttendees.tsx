import React from 'react';
import BulkAttendeesPanel from '../components/admin/BulkAttendeesPanel';

const AdminBulkAttendees: React.FC = () => (
  <div className="min-h-screen bg-gray-50 py-8">
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Add Attendees</h1>
        <p className="mt-2 text-sm text-gray-600">
          Add multiple attendees to events for sold-out experiences or marketing campaigns.
        </p>
      </header>

      <BulkAttendeesPanel />
    </div>
  </div>
);

export default AdminBulkAttendees;
