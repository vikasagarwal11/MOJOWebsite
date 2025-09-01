import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X,
  Users,
  AlertTriangle,
  Calendar,
  MapPin,
  Clock,
  UserPlus,
  Plus,
  Minus,
  ChevronDown,
  Heart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EventDoc } from '../../hooks/useEvents';
import { useAuth } from '../../contexts/AuthContext';
import { useUserBlocking } from '../../hooks/useUserBlocking';
import { useAttendees } from '../../hooks/useAttendees';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';
import { AttendeeList } from './AttendeeList';
import { CreateAttendeeData, AttendeeStatus, AgeGroup, Relationship } from '../../types/attendee';
import { FamilyMember } from '../../types/family';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface RSVPModalProps {
  event: EventDoc;
  onClose: () => void;
  onAttendeeUpdate?: () => void;
}

export const RSVPModalNew: React.FC<RSVPModalProps> = ({ event, onClose, onAttendeeUpdate }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const { attendees, counts, addAttendee, bulkAddAttendees, refreshAttendees } = useAttendees(
    event.id,
    currentUser?.id || ''
  );
  const { familyMembers } = useFamilyMembers();

  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isAddSectionCollapsed, setIsAddSectionCollapsed] = useState(false);
  const [showFamilyMembers, setShowFamilyMembers] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  type BulkRow = {
    id: string;
    name: string;
    ageGroup: AgeGroup;
    relationship: Relationship;
    rsvpStatus: AttendeeStatus;
  };

  const makeId = () =>
    (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const [bulkFormData, setBulkFormData] = useState<{ familyMembers: BulkRow[] }>({
    familyMembers: [
      {
        id: makeId(),
        name: '',
        ageGroup: '11+',
        relationship: 'guest',
        rsvpStatus: 'going',
      },
    ],
  });

  const isBlockedFromRSVP = blockedUsers.some(
    (block) => block.blockCategory === 'rsvp_only' && block.isActive
  );

  const toJsDate = (d: any) => (d?.toDate ? d.toDate() : new Date(d));
  const formatEventDate = (d: any) => (d ? format(toJsDate(d), 'MMM dd, yyyy') : 'TBD');
  const formatEventTime = (d: any) => (d ? format(toJsDate(d), 'h:mm a') : 'TBD');
  const isEventPast = !!event.startAt && toJsDate(event.startAt) < new Date();

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => onClose(), 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isOpen ? 'hidden' : previousOverflow;

    if (isOpen) {
      const modal = document.querySelector('[role="dialog"]') as HTMLElement | null;
      const firstFocusable = modal?.querySelector<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (firstFocusable as HTMLElement | undefined)?.focus();
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const availableFamilyMembers = familyMembers.filter(
    (familyMember) =>
      !attendees.some(
        (attendee) =>
          attendee.userId === currentUser?.id && attendee.familyMemberId === familyMember.id
      )
  );

  const addBulkFormRow = () => {
    setBulkFormData((prev) => ({
      familyMembers: [
        ...prev.familyMembers,
        { id: makeId(), name: '', ageGroup: '11+', relationship: 'guest', rsvpStatus: 'going' },
      ],
    }));
  };

  const removeBulkFormRow = (id: string) => {
    setBulkFormData((prev) => ({
      familyMembers:
        prev.familyMembers.length > 1
          ? prev.familyMembers.filter((m) => m.id !== id)
          : prev.familyMembers,
    }));
  };

  const updateBulkFormField = (id: string, field: keyof BulkRow, value: string) => {
    setBulkFormData((prev) => ({
      familyMembers: prev.familyMembers.map((m) =>
        m.id === id ? ({ ...m, [field]: value } as BulkRow) : m
      ),
    }));
  };

  const handleBulkAddFamilyMembers = async () => {
    if (!currentUser || bulkFormData.familyMembers.length === 0) return;
    const validMembers = bulkFormData.familyMembers.filter((m) => m.name.trim());
    if (validMembers.length === 0) return;

    try {
      setLoading(true);
      const attendeesData: CreateAttendeeData[] = validMembers.map((member) => ({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        relationship: member.relationship || 'guest',
        name: member.name.trim(),
        ageGroup: member.ageGroup || '11+',
        rsvpStatus: member.rsvpStatus || 'going',
      }));
      await bulkAddAttendees(attendeesData);
      setBulkFormData({
        familyMembers: [{ id: makeId(), name: '', ageGroup: '11+', relationship: 'guest', rsvpStatus: 'going' }],
      });
      await refreshAttendees();
      onAttendeeUpdate?.();
      toast.success(`${validMembers.length} attendee(s) added successfully!`);
    } catch (error) {
      console.error('Failed to add attendees:', error);
      toast.error('Failed to add attendees. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFamilyMember = async (familyMember: FamilyMember) => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const attendeeData: CreateAttendeeData = {
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        familyMemberId: familyMember.id,
        relationship: 'guest',
        name: familyMember.name,
        ageGroup: familyMember.ageGroup || '11+',
        rsvpStatus: 'going',
      };
      await addAttendee(attendeeData);
      await refreshAttendees();
      onAttendeeUpdate?.();
      toast.success(`${familyMember.name} added successfully!`);
    } catch (error) {
      console.error('Failed to add family member:', error);
      toast.error('Failed to add family member. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAddFromProfile = async (members: FamilyMember[]) => {
    if (!currentUser || members.length === 0) return;
    try {
      setLoading(true);
      const attendeesData: CreateAttendeeData[] = members.map((member) => ({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        familyMemberId: member.id,
        relationship: 'guest',
        name: member.name,
        ageGroup: member.ageGroup || '11+',
        rsvpStatus: 'going',
      }));
      await bulkAddAttendees(attendeesData);
      await refreshAttendees();
      onAttendeeUpdate?.();
      toast.success(`${members.length} family members added successfully!`);
    } catch (error) {
      console.error('Failed to add family members:', error);
      toast.error('Failed to add family members. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <span tabIndex={0} onFocus={() => closeBtnRef.current?.focus()} />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
            onClick={handleClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rsvp-title"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] 2xl:max-w-7xl max-h-[95vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-6 h-6" />
                    <div>
                      <h2 id="rsvp-title" className="text-2xl font-bold">
                        {event.title}
                      </h2>
                      <div className="flex items-center gap-4 text-white/80 text-sm mt-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatEventDate(event.startAt)}</span>
                        </div>
                        {event.startAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatEventTime(event.startAt)}</span>
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[150px]">{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    ref={closeBtnRef}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClose}
                    className="p-2 bg-white bg-opacity-20 rounded-full hover:bg-opacity-30 transition-all"
                    aria-label="Close RSVP modal"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>

              <div
                className="flex-1 overflow-y-auto pb-6 pr-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db #f3f4f6', scrollbarGutter: 'stable' }}
              >
                {isBlockedFromRSVP ? (
                  <div className="p-6 text-center">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">RSVP Access Restricted</h3>
                    <p className="text-gray-600">You are currently blocked from RSVPing to events. Please contact an administrator.</p>
                  </div>
                ) : isEventPast ? (
                  <div className="p-6 text-center">
                    <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Event Has Passed</h3>
                    <p className="text-gray-600">This event has already occurred. RSVPs are no longer accepted.</p>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="mb-6">
                      <div className="flex items-center gap-4 mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Manage Attendees</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span>{counts.goingCount} Going</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full" />
                            <span>{counts.notGoingCount} Not Going</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                            <span>{counts.pendingCount} Pending</span>
                          </span>
                          {event.maxAttendees && (
                            <span
                              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                counts.totalGoing >= event.maxAttendees
                                  ? 'bg-red-100 text-red-800'
                                  : counts.totalGoing >= event.maxAttendees * 0.9
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-green-100 text-green-800'
                              }`}
                            >
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  counts.totalGoing >= event.maxAttendees
                                    ? 'bg-red-500'
                                    : counts.totalGoing >= event.maxAttendees * 0.9
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                }`}
                              />
                              <span>
                                {counts.totalGoing}/{event.maxAttendees}
                                {counts.totalGoing >= event.maxAttendees
                                  ? ' Full'
                                  : counts.totalGoing >= event.maxAttendees * 0.9
                                  ? ' Nearly Full'
                                  : ' Available'}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-[#F25129]/10 border border-[#F25129]/20 rounded-lg mb-4">
                        <motion.button
                          id="add-attendees-trigger"
                          aria-expanded={!isAddSectionCollapsed}
                          aria-controls="add-attendees-panel"
                          onClick={() => setIsAddSectionCollapsed((v) => !v)}
                          className="w-full p-4 flex items-center justify-between hover:bg-[#F25129]/20 transition-colors"
                          aria-label={`${isAddSectionCollapsed ? 'Expand' : 'Collapse'} Add Attendees section`}
                        >
                          <div className="flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-[#F25129]" />
                            <h4 className="font-medium text-gray-900">Add Attendees</h4>
                            <span className="text-sm text-gray-500">
                              ({bulkFormData.familyMembers.filter((m) => m.name.trim()).length} ready to add)
                            </span>
                          </div>
                          <motion.div animate={{ rotate: isAddSectionCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          </motion.div>
                        </motion.button>

                        {!isAddSectionCollapsed && (
                          <div className="px-4 pt-2">
                            {event.maxAttendees && counts.totalGoing >= event.maxAttendees * 0.9 && (
                              <div
                                className={`mb-3 p-3 rounded-lg text-sm ${
                                  counts.totalGoing >= event.maxAttendees
                                    ? 'bg-red-50 border border-red-200 text-red-800'
                                    : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4" />
                                  <span className="font-medium">
                                    {counts.totalGoing >= event.maxAttendees ? 'Event is at capacity' : 'Event is nearly full'}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs opacity-90">
                                  {counts.totalGoing >= event.maxAttendees
                                    ? 'You can still add people (limit not enforced), but consider capacity.'
                                    : `Only ${event.maxAttendees - counts.totalGoing} slot${
                                        event.maxAttendees - counts.totalGoing === 1 ? '' : 's'
                                      } remaining.`}
                                </p>
                              </div>
                            )}
                            <div className="flex justify-end">
                              <button
                                onClick={addBulkFormRow}
                                className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors flex items-center gap-2 text-sm"
                              >
                                <Plus className="w-4 h-4" />
                                + Add Row
                              </button>
                            </div>
                          </div>
                        )}

                        <AnimatePresence>
                          {!isAddSectionCollapsed && (
                            <motion.div
                              id="add-attendees-panel"
                              role="region"
                              aria-labelledby="add-attendees-trigger"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 pt-0">
                                <div
                                  className="max-h-[180px] overflow-y-auto space-y-3 pr-2"
                                  style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db #f3f4f6' }}
                                >
                                  {bulkFormData.familyMembers.map((member) => (
                                    <div key={member.id} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                                      <input
                                        type="text"
                                        placeholder="Name"
                                        value={member.name}
                                        onChange={(e) => updateBulkFormField(member.id, 'name', e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                                      />
                                      <select
                                        value={member.ageGroup}
                                        onChange={(e) => updateBulkFormField(member.id, 'ageGroup', e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                                      >
                                        <option value="0-2">0-2 Years</option>
                                        <option value="3-5">3-5 Years</option>
                                        <option value="6-10">6-10 Years</option>
                                        <option value="11+">11+ Years</option>
                                      </select>
                                      <select
                                        value={member.relationship}
                                        onChange={(e) => updateBulkFormField(member.id, 'relationship', e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                                      >
                                        <option value="spouse">Spouse</option>
                                        <option value="child">Child</option>
                                        <option value="guest">Guest</option>
                                      </select>
                                      <select
                                        value={member.rsvpStatus}
                                        onChange={(e) => updateBulkFormField(member.id, 'rsvpStatus', e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                                      >
                                        <option value="going">Going</option>
                                        <option value="not-going">Not Going</option>
                                        <option value="pending">Pending</option>
                                      </select>
                                      {bulkFormData.familyMembers.length > 1 && (
                                        <button
                                          onClick={() => removeBulkFormRow(member.id)}
                                          className="w-10 h-10 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center justify-center"
                                          title="Remove row"
                                        >
                                          <Minus className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-4 pt-3 border-t border-[#F25129]/20">
                                  <button
                                    onClick={handleBulkAddFamilyMembers}
                                    disabled={loading || bulkFormData.familyMembers.every((m) => !m.name.trim())}
                                    className="w-full px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {loading
                                      ? 'Adding...'
                                      : `Add ${bulkFormData.familyMembers.filter((m) => m.name.trim()).length} Attendee(s)`}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {familyMembers.length > 0 && (
                        <div className="bg-[#F25129]/10 border border-[#F25129]/20 rounded-lg mb-4">
                          <motion.button
                            id="family-members-trigger"
                            aria-expanded={showFamilyMembers}
                            aria-controls="family-members-panel"
                            onClick={() => setShowFamilyMembers((v) => !v)}
                            className="w-full p-4 flex items-center justify-between hover:bg-[#F25129]/20 transition-colors"
                            aria-label={`${showFamilyMembers ? 'Collapse' : 'Expand'} Family Members section`}
                          >
                            <div className="flex items-center gap-2">
                              <Heart className="w-4 h-4 text-[#F25129]" />
                              <h4 className="font-medium text-gray-900">Add from Family Profile</h4>
                              <span className="text-sm text-gray-500">({availableFamilyMembers.length} available)</span>
                            </div>
                            <motion.div animate={{ rotate: showFamilyMembers ? 0 : 180 }} transition={{ duration: 0.2 }}>
                              <ChevronDown className="w-5 h-5 text-gray-500" />
                            </motion.div>
                          </motion.button>

                          <AnimatePresence>
                            {showFamilyMembers && (
                              <motion.div
                                id="family-members-panel"
                                role="region"
                                aria-labelledby="family-members-trigger"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 pt-0">
                                  {event.maxAttendees && counts.totalGoing >= event.maxAttendees * 0.9 && (
                                    <div
                                      className={`mb-4 p-3 rounded-lg text-sm ${
                                        counts.totalGoing >= event.maxAttendees
                                          ? 'bg-red-50 border border-red-200 text-red-800'
                                          : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span className="font-medium">
                                          {counts.totalGoing >= event.maxAttendees ? 'Event is at capacity' : 'Event is nearly full'}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs opacity-90">
                                        {counts.totalGoing >= event.maxAttendees
                                          ? 'You can still add people (limit not enforced), but consider capacity.'
                                          : `Only ${event.maxAttendees - counts.totalGoing} slot${
                                              event.maxAttendees - counts.totalGoing === 1 ? '' : 's'
                                            } remaining.`}
                                      </p>
                                    </div>
                                  )}

                                  {availableFamilyMembers.length > 0 ? (
                                    <>
                                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
                                            <div className="col-span-5">Name</div>
                                            <div className="col-span-3">Age</div>
                                            <div className="col-span-2">Status</div>
                                            <div className="col-span-2">Action</div>
                                          </div>
                                        </div>

                                        <div className="divide-y divide-gray-100">
                                          {availableFamilyMembers.map((familyMember, index) => (
                                            <div
                                              key={familyMember.id}
                                              className={`px-3 py-2.5 hover:bg-[#F25129]/10 transition-colors ${
                                                index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                              }`}
                                            >
                                              <div className="grid grid-cols-12 gap-2 items-center">
                                                <div className="col-span-5">
                                                  <span className="font-medium text-gray-900 text-sm">{familyMember.name}</span>
                                                </div>
                                                <div className="col-span-3">
                                                  <span className="text-xs text-gray-500">
                                                    {familyMember.ageGroup ? `${familyMember.ageGroup} years` : 'Not set'}
                                                  </span>
                                                </div>
                                                <div className="col-span-2">
                                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    Available
                                                  </span>
                                                </div>
                                                <div className="col-span-2">
                                                  <button
                                                    onClick={() => handleAddFamilyMember(familyMember)}
                                                    disabled={loading}
                                                    className="w-full px-2 py-1 bg-[#F25129] text-white rounded text-xs font-medium hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    {loading ? 'Adding...' : 'Add'}
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="mt-4 pt-3 border-t border-[#F25129]/20">
                                        <button
                                          onClick={() => handleBulkAddFromProfile(availableFamilyMembers)}
                                          disabled={loading}
                                          className="w-full px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          {loading ? 'Adding...' : `Add All ${availableFamilyMembers.length} Family Members`}
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-center py-6">
                                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                      <p className="text-gray-600 mb-2">All family members already added!</p>
                                      <p className="text-sm text-gray-500">
                                        Your family members from your profile have already been added to this event.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <AttendeeList
                          eventId={event.id}
                          onAttendeeUpdate={async () => {
                            try { await refreshAttendees(); } catch {}
                            onAttendeeUpdate?.();
                          }}
                        />
                      </div>
                    </div>

                    {event.description && (
                      <div className="mt-6 bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Event Details</h4>
                        <div className="relative">
                          <p className={`text-gray-700 leading-relaxed ${!isDescriptionExpanded ? 'line-clamp-2' : ''}`}>
                            {event.description}
                          </p>
                          {event.description.length > 120 && (
                            <button
                              onClick={() => setIsDescriptionExpanded((v) => !v)}
                              className="text-[#F25129] hover:text-[#E0451F] text-sm font-medium mt-1"
                            >
                              {isDescriptionExpanded ? 'Show less' : 'View event details...'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 p-4 bg-gray-50 mt-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Total Going:</span> {counts.totalGoing}
                    {event.maxAttendees && <span className="ml-2">/ {event.maxAttendees} max</span>}
                  </div>
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleClose}
                      className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Close
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          <span tabIndex={0} onFocus={() => closeBtnRef.current?.focus()} />
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
