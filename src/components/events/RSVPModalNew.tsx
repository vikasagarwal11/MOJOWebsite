import React, { useState, useEffect, useId, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  AlertTriangle,
  Calendar,
  UserPlus,
  Users,
  Plus,
  Minus,
  ChevronDown,
  Heart,
  QrCode,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EventDoc } from '../../hooks/useEvents';
import { useAuth } from '../../contexts/AuthContext';
import { useUserBlocking } from '../../hooks/useUserBlocking';
import { useAttendees } from '../../hooks/useAttendees';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';
import { AttendeeList } from './AttendeeList';
import { LoadingSpinner, LoadingButton } from '../ui/LoadingSpinner';
import { CreateAttendeeData, AttendeeStatus, AgeGroup, Relationship } from '../../types/attendee';
import { FamilyMember } from '../../types/family';

import toast from 'react-hot-toast';
// Import our new hooks
import { useEventDates } from './RSVPModalNew/hooks/useEventDates';
import { useCapacityState } from './RSVPModalNew/hooks/useCapacityState';
import { useModalA11y } from './RSVPModalNew/hooks/useModalA11y';
import { getCapacityBadgeClasses } from './RSVPModalNew/rsvpUi';
// Import new components
import { Header } from './RSVPModalNew/components/Header';
import { EventDetails } from './RSVPModalNew/components/EventDetails';
import { AttendeeInputRowMemo } from './RSVPModalNew/components/AttendeeInputRow';
import { QRCodeTab } from './QRCodeTab';
import { PaymentSection } from './PaymentSection';

interface RSVPModalProps {
  event: EventDoc;
  onClose: () => void;
  onAttendeeUpdate?: () => void;
}

export const RSVPModalNew: React.FC<RSVPModalProps> = ({ event, onClose, onAttendeeUpdate }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Accessible, collision-free IDs for aria-controls/labelledby
  const addId = useId();
  const famId = useId();

  // Reduced-motion aware transitions
  const prefersReduced = useReducedMotion();
  const modalTransition = useMemo(
    () => (prefersReduced ? { duration: 0 } : { type: 'spring' as const, duration: 0.25 }),
    [prefersReduced]
  );
  
  // Check if current user is the event creator (admin)
  const isEventCreator = currentUser?.id === event.createdBy;
  
  const { attendees, counts, addAttendee, bulkAddAttendees, refreshAttendees, updateAttendee } = useAttendees(
    event.id,
    currentUser?.id || '',
    isEventCreator // Pass admin flag to use different data source
  );
  const { familyMembers } = useFamilyMembers();

  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isAddSectionCollapsed, setIsAddSectionCollapsed] = useState(false);
  const [showFamilyMembers, setShowFamilyMembers] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendees' | 'qr'>('attendees');



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

  const [bulkFormData, setBulkFormData] = useState<{ familyMembers: BulkRow[] }>(() => ({
    familyMembers: [
      {
        id: makeId(),
        name: '',
        ageGroup: 'adult',
        relationship: 'guest',
        rsvpStatus: 'going',
      },
    ],
  }));

  const isBlockedFromRSVP = blockedUsers.some(
    (block) => block.blockCategory === 'rsvp_only' && block.isActive
  );

  // Use our new date hook
  const { 
    isEventPast
  } = useEventDates(event);

  // Use our new capacity state hook
  const capacityState = useCapacityState(counts, event.maxAttendees);

  // Memoize the ready to add count to prevent unnecessary re-renders
  const readyToAddCount = useMemo(() => 
    bulkFormData.familyMembers.filter((m) => m.name.trim()).length, 
    [bulkFormData.familyMembers]
  );

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => onClose(), 200);
  };

  // Use our new accessibility hook
  const { dialogProps, closeBtnRef } = useModalA11y({ isOpen, onClose: handleClose });

  const availableFamilyMembers = familyMembers.filter(
    (familyMember) =>
      !attendees.some(
        (attendee) =>
          attendee.userId === currentUser?.id && attendee.familyMemberId === familyMember.id
      )
  );

  const addBulkFormRow = useCallback(() => {
    setBulkFormData((prev) => ({
      familyMembers: [
        ...prev.familyMembers,
        { id: makeId(), name: '', ageGroup: 'adult', relationship: 'guest', rsvpStatus: 'going' },
      ],
    }));
  }, []);

  const removeBulkFormRow = useCallback((id: string) => {
    setBulkFormData((prev) => ({
      familyMembers:
        prev.familyMembers.length > 1
          ? prev.familyMembers.filter((m) => m.id !== id)
          : prev.familyMembers,
    }));
  }, []);

  const updateBulkFormField = useCallback((id: string, field: keyof BulkRow, value: string) => {
    setBulkFormData((prev) => ({
      familyMembers: prev.familyMembers.map((m) =>
        m.id === id ? ({ ...m, [field]: value } as BulkRow) : m
      ),
    }));
  }, []);

  const handleBulkAddFamilyMembers = async () => {
    if (!currentUser || bulkFormData.familyMembers.length === 0) return;
    const validMembers = bulkFormData.familyMembers.filter((m) => m.name.trim());
    if (validMembers.length === 0) return;

    try {
      setLoading(true);
      
      // Check if primary member is already an attendee
      const existingPrimaryAttendee = attendees.find(
        attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
      );
      
      const attendeesData: CreateAttendeeData[] = validMembers.map((member) => ({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        relationship: member.relationship || 'guest',
        name: member.name.trim(),
        ageGroup: member.ageGroup || 'adult',
        rsvpStatus: member.rsvpStatus || 'going',
      }));
      
      // Add primary member if not already exists, or update existing one to going
      if (!existingPrimaryAttendee) {
        attendeesData.unshift({
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'You',
          ageGroup: 'adult',
          rsvpStatus: 'going',
        });
      } else if (existingPrimaryAttendee.rsvpStatus !== 'going') {
        // Update existing primary member to going status
        await updateAttendee(existingPrimaryAttendee.attendeeId, { rsvpStatus: 'going' });
        toast.success('You have been automatically set to "going" since family members are attending.');
      }
      
      await bulkAddAttendees(attendeesData);
      setBulkFormData({
        familyMembers: [{ id: makeId(), name: '', ageGroup: 'adult', relationship: 'guest', rsvpStatus: 'going' }],
      });
      await refreshAttendees();
      onAttendeeUpdate?.();
      toast.success(`${validMembers.length} attendee(s) added successfully!${!existingPrimaryAttendee ? ' You have also been added as attending.' : ''}`);
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
      
      // Check if primary member is already an attendee
      const existingPrimaryAttendee = attendees.find(
        attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
      );
      
      const attendeesToAdd: CreateAttendeeData[] = [];
      
      // Add family member
      attendeesToAdd.push({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        familyMemberId: familyMember.id,
        relationship: 'guest',
        name: familyMember.name,
        ageGroup: familyMember.ageGroup || 'adult',
        rsvpStatus: 'going',
      });
      
      // Add primary member if not already exists, or update existing one to going
      if (!existingPrimaryAttendee) {
        attendeesToAdd.push({
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'You',
          ageGroup: 'adult',
          rsvpStatus: 'going',
        });
      } else if (existingPrimaryAttendee.rsvpStatus !== 'going') {
        // Update existing primary member to going status
        await updateAttendee(existingPrimaryAttendee.attendeeId, { rsvpStatus: 'going' });
        toast.success('You have been automatically set to "going" since a family member is attending.');
      }
      
      // Add family member (and primary if new)
      if (attendeesToAdd.length === 1) {
        await addAttendee(attendeesToAdd[0]);
      } else {
        await bulkAddAttendees(attendeesToAdd);
      }
      
      await refreshAttendees();
      onAttendeeUpdate?.();
      toast.success(`${familyMember.name} added successfully!${!existingPrimaryAttendee ? ' You have also been added as attending.' : ''}`);
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
      
      // Check if primary member is already an attendee
      const existingPrimaryAttendee = attendees.find(
        attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
      );
      
      const attendeesData: CreateAttendeeData[] = members.map((member) => ({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        familyMemberId: member.id,
        relationship: 'guest',
        name: member.name,
        ageGroup: member.ageGroup || 'adult',
        rsvpStatus: 'going',
      }));
      
      // Add primary member if not already exists, or update existing one to going
      if (!existingPrimaryAttendee) {
        attendeesData.unshift({
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'You',
          ageGroup: 'adult',
          rsvpStatus: 'going',
        });
      } else if (existingPrimaryAttendee.rsvpStatus !== 'going') {
        // Update existing primary member to going status
        await updateAttendee(existingPrimaryAttendee.attendeeId, { rsvpStatus: 'going' });
        toast.success('You have been automatically set to "going" since family members are attending.');
      }
      
      await bulkAddAttendees(attendeesData);
      await refreshAttendees();
      onAttendeeUpdate?.();
      toast.success(`${members.length} family members added successfully!${!existingPrimaryAttendee ? ' You have also been added as attending.' : ''}`);
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50
    flex items-start md:items-center justify-center
    p-4 bg-black bg-opacity-50"
            onClick={handleClose}
          >
            <motion.div
              {...dialogProps}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={modalTransition}
              className="rsvp-dialog bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] md:max-w-[50vw] lg:max-w-[45vw] xl:max-w-[40vw] 2xl:max-w-2xl 
              /* make it a flex column and bound its height */  flex flex-col 
              /* fallback max height for older browsers */ max-h-[95vh]
              /* overflow-hidden */ overflow-hidden"
              /* modern mobile-safe height (works where supported) */
              style={{ maxHeight: 'min(95svh, 95dvh)' } as React.CSSProperties}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Component */}
              <Header 
                event={event}
                onClose={onClose}
                closeBtnRef={closeBtnRef}
                isCompact={isMobile}
              />
              
              {/* Event Details (Mobile only) */}
              <EventDetails 
                event={event}
                isMobile={isMobile}
              />

              {/* Tab Navigation */}
              <div className="px-6 py-3 border-b border-gray-200">
                <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab('attendees')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === 'attendees'
                        ? 'bg-white text-[#F25129] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Attendees
                  </button>
                  {event.attendanceEnabled && (
                    <button
                      onClick={() => setActiveTab('qr')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'qr'
                          ? 'bg-white text-[#F25129] shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      QR Code
                    </button>
                  )}
                </div>
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto pb-6 pr-2 rsvp-modal-scrollbar modalScroll"
                style={{ scrollbarGutter: 'stable both-edges' }}
              >
                {activeTab === 'qr' && event.attendanceEnabled ? (
                  <div className="p-6">
                    <QRCodeTab 
                      event={event} 
                      onEventUpdate={() => {
                        // Refresh event data when QR attendance is toggled
                        onAttendeeUpdate?.();
                      }}
                    />
                  </div>
                ) : isBlockedFromRSVP ? (
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
                  <div className="p-3">
                    {/* Payment Section */}
                    <PaymentSection 
                      event={event}
                      attendees={attendees}
                      onPaymentComplete={() => {
                        refreshAttendees();
                        onAttendeeUpdate?.();
                      }}
                      onPaymentError={(error) => {
                        console.error('Payment error:', error);
                      }}
                    />

                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-[15px] font-semibold text-gray-900">Manage Attendees</h3>
                        <div className="flex items-center gap-2 text-[12px] text-gray-600">
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

                        </div>
                      </div>

                      <div className="bg-[#F25129]/10 border border-[#F25129]/20 rounded-lg mb-4">
                        <motion.button
                          id="add-attendees-trigger"
                          aria-expanded={!isAddSectionCollapsed}
                          aria-controls="add-attendees-panel"
                          onClick={() => setIsAddSectionCollapsed((v) => !v)}
                          className="w-full p-3 flex items-center justify-between hover:bg-[#F25129]/20 transition-colors"
                          aria-label={`${isAddSectionCollapsed ? 'Expand' : 'Collapse'} Add Attendees section`}
                        >
                          <div className="flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-[#F25129]" />
                            <h4 className="font-medium text-gray-900 text-[13px]">Add Attendees</h4>
                            <span className="text-[12px] text-gray-500">
                              ({readyToAddCount} ready to add)
                            </span>
                          </div>
                          <motion.div animate={{ rotate: isAddSectionCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          </motion.div>
                        </motion.button>

                        {!isAddSectionCollapsed && (
                          <div className="px-4 pt-2">
                            {capacityState.isNearlyFull && (
                              <div className={`mb-3 p-3 rounded-lg text-sm ${getCapacityBadgeClasses(capacityState.state)}`}>
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4" />
                                  <span className="font-medium">{capacityState.warningMessage}</span>
                                </div>
                                <p className="mt-1 text-xs opacity-90">{capacityState.slotsRemainingText}</p>
                              </div>
                            )}

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
                              <div className="p-2 pt-0">
                                {/* Table Header */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
                                                                     <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
                                     <div className="grid grid-cols-12 gap-2 text-[12px] font-medium text-gray-600">
                                       <div className="col-span-4">Name</div>
                                       <div className="col-span-3">Age</div>
                                       <div className="col-span-3">Relation</div>
                                       <div className="col-span-2">Actions</div>
                                     </div>
                                   </div>
                                  
                                  {/* Table Body */}
                                  <div className="divide-y divide-gray-100">
                                    <div
                                      className="max-h-[180px] overflow-y-auto rsvp-modal-scrollbar modalScroll"
                                      style={{ scrollbarGutter: 'stable both-edges' }}
                                    >
                                      {bulkFormData.familyMembers.map((member, index) => (
                                        <div 
                                          key={member.id}
                                          className="py-2"
                                        >
                                          <div className="px-2.5">
                                            <AttendeeInputRowMemo
                                              member={member}
                                              onUpdate={updateBulkFormField}
                                              onRemove={removeBulkFormRow}
                                              onAdd={addBulkFormRow}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-[#F25129]/20">
                                  <button
                                    onClick={handleBulkAddFamilyMembers}
                                    disabled={loading || bulkFormData.familyMembers.every((m) => !m.name.trim())}
                                    className="w-full px-3.5 py-2 text-sm bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {loading
                                      ? 'Adding...'
                                      : `Add ${readyToAddCount} Attendee(s)`}
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
                            className="w-full p-3 flex items-center justify-between hover:bg-[#F25129]/20 transition-colors"
                            aria-label={`${showFamilyMembers ? 'Collapse' : 'Expand'} Family Members section`}
                          >
                            <div className="flex items-center gap-2">
                              <Heart className="w-4 h-4 text-[#F25129]" />
                              <h4 className="font-medium text-gray-900 text-[13px]">Add from Family Profile</h4>
                              <span className="text-[12px] text-gray-500">({availableFamilyMembers.length} available)</span>
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
                                  {capacityState.isNearlyFull && (
                                    <div className={`mb-4 p-3 rounded-lg text-sm ${getCapacityBadgeClasses(capacityState.state)}`}>
                                      <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span className="font-medium">{capacityState.warningMessage}</span>
                                      </div>
                                      <p className="mt-1 text-xs opacity-90">{capacityState.slotsRemainingText}</p>
                                    </div>
                                  )}

                                  {availableFamilyMembers.length > 0 ? (
                                    <>
                                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        {/* Header row - hidden on mobile, visible on sm+ */}
                                        <div className="hidden sm:block bg-gray-50 px-3 py-2 border-b border-gray-200">
                                          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
                                            <div className="col-span-5">Name</div>
                                            <div className="col-span-3">Age</div>
                                            <div className="col-span-2">Status</div>
                                            <div className="col-span-2">Action</div>
                                          </div>
                                        </div>

                                        {/* Rows */}
                                        <div className="divide-y divide-gray-100">
                                          {availableFamilyMembers.map((familyMember, index) => (
                                            <div
                                              key={familyMember.id}
                                              className={`px-3 py-2 hover:bg-[#F25129]/10 transition-colors ${
                                                index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                              }`}
                                            >
                                              {/* Stack on mobile, 12-col on sm+ */}
                                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                                <div className="sm:col-span-5">
                                                  <span className="font-medium text-gray-900 text-[13px]">{familyMember.name}</span>
                                                </div>
                                                <div className="sm:col-span-3 text-[12px] text-gray-500">
                                                  {familyMember.ageGroup ? 
                                                    (familyMember.ageGroup === 'adult' ? 'Adult' :
                                                     familyMember.ageGroup === '11+' ? '11+ Years' :
                                                     familyMember.ageGroup === '0-2' ? '0-2 Years' :
                                                     familyMember.ageGroup === '3-5' ? '3-5 Years' :
                                                     familyMember.ageGroup === '6-10' ? '6-10 Years' :
                                                     `${familyMember.ageGroup} years`) : 'Not set'}
                                                </div>
                                                <div className="sm:col-span-2">
                                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-800">
                                                    Available
                                                  </span>
                                                </div>
                                                <div className="sm:col-span-2">
                                                  <button
                                                    onClick={() => handleAddFamilyMember(familyMember)}
                                                    disabled={loading}
                                                    className="w-full px-2 py-1.5 text-[12px] bg-[#F25129] text-white rounded hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                                        <LoadingButton
                                          loading={loading}
                                          onClick={() => handleBulkAddFromProfile(availableFamilyMembers)}
                                          className="w-full px-3.5 py-2 text-sm bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          Add All {availableFamilyMembers.length} Family Members
                                        </LoadingButton>
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

              <div className="border-t border-gray-200 p-4 bg-gray-50 mt-2 safe-footer">
                <div className="flex items-center justify-end">
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={prefersReduced ? undefined : { scale: 1.05 }}
                      whileTap={prefersReduced ? undefined : { scale: 0.95 }}
                      onClick={handleClose}
                      className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors text-[13px]"
                    >
                      Close
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
