import React from 'react';
import CleanupToolPanel from '../components/admin/CleanupToolPanel';

const AdminCleanup: React.FC = () => (
  <div className="min-h-screen bg-gray-50 py-10">
    <div className="mx-auto max-w-3xl px-4">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Admin Cleanup Tools</h1>
        <p className="mt-2 text-sm text-gray-600">
          Fix duplicate attendee counts or wipe an event clean ahead of a new import.
        </p>
      </header>

      <CleanupToolPanel />
    </div>
  </div>
);

export default AdminCleanup;
