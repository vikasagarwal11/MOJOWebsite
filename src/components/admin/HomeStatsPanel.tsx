import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getHomeStatsSettings,
  updateHomeStatsSettings,
  type HomeStatsSettings,
} from '../../services/homeStatsService';

const HomeStatsPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<HomeStatsSettings | null>(null);
  const [activeMembersInput, setActiveMembersInput] = useState('190');
  const [activeMembersShowPlusSign, setActiveMembersShowPlusSign] = useState(true);
  const [monthlyEventsInput, setMonthlyEventsInput] = useState('2');
  const [monthlyEventsShowPlusSign, setMonthlyEventsShowPlusSign] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getHomeStatsSettings();
        if (!active) return;
        setSettings(data);
        setActiveMembersInput(String(data.activeMembersCount));
        setActiveMembersShowPlusSign(data.activeMembersShowPlusSign !== false);
        setMonthlyEventsInput(String(data.monthlyEventsCount));
        setMonthlyEventsShowPlusSign(data.monthlyEventsShowPlusSign !== false);
      } catch (err: any) {
        console.error('[HomeStatsPanel] Failed to load home stats settings', err);
        toast.error('Failed to load home stats settings.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const parsedActiveMembersCount = useMemo(() => {
    const n = Number(activeMembersInput);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    if (rounded < 0) return null;
    return rounded;
  }, [activeMembersInput]);

  const parsedMonthlyEventsCount = useMemo(() => {
    const n = Number(monthlyEventsInput);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    if (rounded < 0) return null;
    return rounded;
  }, [monthlyEventsInput]);

  const hasChanges = useMemo(() => {
    if (!settings) return false;
    if (parsedActiveMembersCount === null || parsedMonthlyEventsCount === null) return false;
    return (
      parsedActiveMembersCount !== settings.activeMembersCount ||
      activeMembersShowPlusSign !== (settings.activeMembersShowPlusSign !== false) ||
      parsedMonthlyEventsCount !== settings.monthlyEventsCount ||
      monthlyEventsShowPlusSign !== (settings.monthlyEventsShowPlusSign !== false)
    );
  }, [
    settings,
    parsedActiveMembersCount,
    activeMembersShowPlusSign,
    parsedMonthlyEventsCount,
    monthlyEventsShowPlusSign,
  ]);

  const activeMembersPreviewText =
    parsedActiveMembersCount === null
      ? 'Invalid number'
      : `${parsedActiveMembersCount}${activeMembersShowPlusSign ? '+' : ''}`;
  const monthlyEventsPreviewText =
    parsedMonthlyEventsCount === null
      ? 'Invalid number'
      : `${parsedMonthlyEventsCount}${monthlyEventsShowPlusSign ? '+' : ''}`;

  const handleSave = async () => {
    if (!currentUser) {
      toast.error('You must be logged in as admin.');
      return;
    }
    if (parsedActiveMembersCount === null || parsedMonthlyEventsCount === null) {
      toast.error('Please enter valid numbers for both stats.');
      return;
    }

    try {
      setSaving(true);
      await updateHomeStatsSettings(
        {
          activeMembersCount: parsedActiveMembersCount,
          activeMembersShowPlusSign,
          monthlyEventsCount: parsedMonthlyEventsCount,
          monthlyEventsShowPlusSign,
        },
        currentUser.id
      );

      setSettings((prev) => ({
        activeMembersCount: parsedActiveMembersCount,
        activeMembersShowPlusSign,
        monthlyEventsCount: parsedMonthlyEventsCount,
        monthlyEventsShowPlusSign,
        updatedAt: prev?.updatedAt,
        updatedBy: currentUser.id,
      }));

      toast.success('Homepage stats updated.');
    } catch (err: any) {
      console.error('[HomeStatsPanel] Failed to save home stats settings', err);
      toast.error('Failed to save home stats settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-gray-600">Loading homepage stats settings...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">Homepage Stats Controls</h2>
        <p className="text-sm text-gray-600 mt-1">
          Update homepage stats shown in the orange section.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <label htmlFor="activeMembersCount" className="block text-sm font-medium text-gray-700 mb-2">
            Active Members Count
          </label>
          <input
            id="activeMembersCount"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={activeMembersInput}
            onChange={(e) => setActiveMembersInput(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            placeholder="190"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={activeMembersShowPlusSign}
            onChange={(e) => setActiveMembersShowPlusSign(e.target.checked)}
            className="w-4 h-4 text-[#F25129] rounded"
          />
          Show plus sign (`+`) for Active Members
        </label>

        <div>
          <label htmlFor="monthlyEventsCount" className="block text-sm font-medium text-gray-700 mb-2">
            Monthly Events Count
          </label>
          <input
            id="monthlyEventsCount"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={monthlyEventsInput}
            onChange={(e) => setMonthlyEventsInput(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            placeholder="2"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={monthlyEventsShowPlusSign}
            onChange={(e) => setMonthlyEventsShowPlusSign(e.target.checked)}
            className="w-4 h-4 text-[#F25129] rounded"
          />
          Show plus sign (`+`) for Monthly Events
        </label>

        <div className="rounded-lg border border-dashed border-[#F25129]/30 bg-[#F25129]/5 px-3 py-2 space-y-2">
          <p className="text-xs text-gray-600 mb-1">Preview</p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700">Active Members</p>
            <p className="text-xl font-bold text-[#F25129]">{activeMembersPreviewText}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700">Monthly Events</p>
            <p className="text-xl font-bold text-[#F25129]">{monthlyEventsPreviewText}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              !hasChanges ||
              parsedActiveMembersCount === null ||
              parsedMonthlyEventsCount === null
            }
            className="rounded-lg bg-[#F25129] px-4 py-2 text-white font-medium hover:bg-[#d9451f] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomeStatsPanel;
