import React, { useMemo, useState } from 'react';
import { cleanupDuplicateAttendees, getCurrentAttendeeCount } from '../../utils/cleanupAttendees';

type CleanupToolPanelProps = {
  className?: string;
};

export const CleanupToolPanel: React.FC<CleanupToolPanelProps> = ({ className }) => {
  const [eventId, setEventId] = useState('5PBaeAgK1Bidw5BHHibr');
  const [targetCount, setTargetCount] = useState(102);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

  const actionDisabled = useMemo(
    () => isLoading || currentCount === null || currentCount <= targetCount,
    [isLoading, currentCount, targetCount]
  );
  const deleteDisabled = useMemo(
    () => isLoading || currentCount === null || currentCount === 0,
    [isLoading, currentCount]
  );

  const checkCurrentCount = async () => {
    try {
      setIsLoading(true);
      setStatus('Checking current attendee count…');
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
      setStatus('Starting cleanup…');
      await cleanupDuplicateAttendees(eventId, targetCount);
      setStatus('Cleanup completed successfully!');
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
      setStatus('Deleting all attendees…');
      await cleanupDuplicateAttendees(eventId, 0);
      setStatus('All attendees deleted. You can now re-upload with the bulk tool.');
      await checkCurrentCount();
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`space-y-4 rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm ${className ?? ''}`}>
      <header className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">Duplicate Attendee Cleanup</h3>
        <p className="text-sm text-gray-600">
          Align event attendee counts by trimming duplicate rows or wiping the slate before re-importing.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Event ID</span>
          <input
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
            disabled={isLoading}
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Target Count</span>
          <input
            type="number"
            value={targetCount}
            onChange={(e) => setTargetCount(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
            disabled={isLoading}
            min={0}
          />
        </label>
      </div>

      {currentCount !== null && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <p>
            <strong>Current Count:</strong> {currentCount} attendees
          </p>
          {currentCount > targetCount && (
            <p className="mt-1 text-xs text-red-600">
              {(currentCount - targetCount).toLocaleString()} duplicate attendees will be removed during cleanup.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={checkCurrentCount}
          disabled={isLoading}
          className="inline-flex items-center rounded-full bg-[#F25129] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#E0451F] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Working…' : 'Check Current Count'}
        </button>
        <button
          type="button"
          onClick={runCleanup}
          disabled={actionDisabled}
          className="inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Run Cleanup
        </button>
        <button
          type="button"
          onClick={deleteAllAttendees}
          disabled={deleteDisabled}
          className="inline-flex items-center rounded-full border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete All & Start Fresh
        </button>
      </div>

      {status && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.includes('Error')
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {status}
        </div>
      )}

      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-xs text-yellow-800">
        ⚠️ Permanent action. Verify the event ID and desired attendee count before running cleanup.
      </div>
    </div>
  );
};

export default CleanupToolPanel;

