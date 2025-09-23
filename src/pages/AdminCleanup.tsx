import React, { useState } from 'react';
import { cleanupDuplicateAttendees, getCurrentAttendeeCount } from '../utils/cleanupAttendees';

const AdminCleanup: React.FC = () => {
  const [eventId, setEventId] = useState('5PBaeAgK1Bidw5BHHibr'); // Diwali event ID
  const [targetCount, setTargetCount] = useState(102);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

  const checkCurrentCount = async () => {
    try {
      setIsLoading(true);
      setStatus('Checking current attendee count...');
      const count = await getCurrentAttendeeCount(eventId);
      setCurrentCount(count);
      setStatus(`Current attendee count: ${count}`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runCleanup = async () => {
    try {
      setIsLoading(true);
      setStatus('Starting cleanup...');
      await cleanupDuplicateAttendees(eventId, targetCount);
      setStatus('Cleanup completed successfully!');
      // Refresh the count
      await checkCurrentCount();
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAllAttendees = async () => {
    try {
      setIsLoading(true);
      setStatus('Deleting all attendees...');
      await cleanupDuplicateAttendees(eventId, 0); // Delete all
      setStatus('All attendees deleted successfully! You can now re-upload with the bulk tool.');
      // Refresh the count
      await checkCurrentCount();
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Cleanup Tool</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Cleanup Duplicate Attendees</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event ID
              </label>
              <input
                type="text"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Count
              </label>
              <input
                type="number"
                value={targetCount}
                onChange={(e) => setTargetCount(parseInt(e.target.value) || 102)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>
            
            {currentCount !== null && (
              <div className="p-4 bg-blue-50 rounded-md">
                <p className="text-blue-800">
                  <strong>Current Count:</strong> {currentCount} attendees
                </p>
                {currentCount > targetCount && (
                  <p className="text-red-600 mt-2">
                    <strong>Action Needed:</strong> {currentCount - targetCount} duplicate attendees will be removed
                  </p>
                )}
              </div>
            )}
            
            <div className="flex space-x-4">
              <button
                onClick={checkCurrentCount}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Check Current Count
              </button>
              
              <button
                onClick={runCleanup}
                disabled={isLoading || currentCount === null || currentCount <= targetCount}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Run Cleanup
              </button>
              
              <button
                onClick={deleteAllAttendees}
                disabled={isLoading || currentCount === null || currentCount === 0}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                Delete All & Start Fresh
              </button>
            </div>
            
            {status && (
              <div className={`p-4 rounded-md ${
                status.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
              }`}>
                {status}
              </div>
            )}
          </div>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-yellow-800 font-semibold mb-2">⚠️ Warning</h3>
          <p className="text-yellow-700 text-sm">
            This tool will permanently delete excess attendees from the event. 
            Make sure you have the correct event ID and target count before proceeding.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminCleanup;
