import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  Trash2,
  Heart
} from 'lucide-react';
// Note: row rendering is inline for performance; no AttendeeItem import needed
import { useAttendees } from '../../hooks/useAttendees';
import { 
  Attendee, 
  AttendeeStatus,
  CreateAttendeeData,
  AttendeeType,
  AgeGroup,
  Relationship
} from '../../types/attendee';
import { useAuth } from '../../contexts/AuthContext';
import { familyMemberService } from '../../services/familyMemberService';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';
import toast from 'react-hot-toast';

interface AttendeeListProps {
  eventId: string;
  onAttendeeUpdate?: () => void;
  isAdmin?: boolean;
  waitlistPositions?: Map<string, number>; // Map of userId to waitlist position
  capacityState?: {
    canAddMore: boolean;
    canWaitlist: boolean;
    isAtCapacity: boolean;
  };
}

export const AttendeeList: React.FC<AttendeeListProps> = ({ 
  eventId, 
  onAttendeeUpdate,
  isAdmin = false,
  waitlistPositions = new Map(),
  capacityState
}) => {
  const { currentUser } = useAuth();
  const { 
    attendees, 
    loading, 
    error, 
    addAttendee,
    updateAttendee, 
    removeAttendee, 
    refreshAttendees 
  } = useAttendees(eventId, currentUser?.id || '', isAdmin);


  
  // Collapsible state for each section
  const [collapsedSections, setCollapsedSections] = useState({
    going: false,
    notGoing: false,
    
    waitlisted: false
  });

  // State for tracking attendees being added to family
  const [addingToFamily, setAddingToFamily] = useState<Set<string>>(new Set());

  // Track per-attendee status errors so we can surface inline feedback
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({});

  const updateStatusError = (attendeeId: string, message?: string) => {
    setStatusErrors(prev => {
      const next = { ...prev };
      if (message) {
        next[attendeeId] = message;
      } else {
        delete next[attendeeId];
      }
      return next;
    });
  };

  // Get family members to check if attendees are already linked
  const { familyMembers: userFamilyMembers, refreshFamilyMembers } = useFamilyMembers();

  // Build a quick lookup so we can show live names/ages when family records are renamed
  const familyMemberById = useMemo(() => {
    const map = new Map<string, { name: string; ageGroup?: string }>();
    userFamilyMembers.forEach(m => map.set(m.id, { name: m.name, ageGroup: m.ageGroup }));
    return map;
  }, [userFamilyMembers]);

  // Safely resolve an attendee's identifier
  const getAttendeeId = (attendee: Attendee): string => {
    return (attendee as any).attendeeId || (attendee as any).id || '';
  };

  const getDisplayName = (attendee: Attendee): string => {
    // Handle bulk-uploaded attendees (no user account)
    if (!attendee.userId) {
      return `${attendee.name} (Bulk Uploaded)`;
    }
    
    if (attendee.familyMemberId) {
      const fm = familyMemberById.get(attendee.familyMemberId);
      if (fm?.name) return fm.name;
    }
    return attendee.name;
  };

  const getDisplayAge = (attendee: Attendee): string | undefined => {
    const age = attendee.familyMemberId ? familyMemberById.get(attendee.familyMemberId)?.ageGroup : undefined;
    return age || attendee.ageGroup;
  };

  const getWaitlistPosition = (attendee: Attendee): number | null => {
    if (!attendee.userId) return null;
    return waitlistPositions.get(attendee.userId) || null;
  };

  const getCapacityBlockedMessage = () => {
    if (capacityState?.canWaitlist) {
      return "This event is already full, but a waitlist is available. Please move this attendee to 'Waitlisted' or contact the organizer.";
    }
    return "This event is already full. Please contact the organizer to open additional spots.";
  };

  // Check if an attendee can be edited (admins/event owners can edit everyone, otherwise users edit themselves)
  const canEditAttendee = (attendee: Attendee): boolean => {
    // Bulk-uploaded attendees cannot be edited
    if (!attendee.userId) {
      console.log('DEBUG: canEditAttendee = false (no userId)', { attendeeId: getAttendeeId(attendee), attendee });
      return false;
    }
    
    // Admins or event owners (isAdmin prop) can edit all attendees
    if (isAdmin) {
      console.log('DEBUG: canEditAttendee = true (admin override)', { attendeeId: getAttendeeId(attendee), attendee });
      return true;
    }
    
    // Only the attendee's owner can edit otherwise
    const canEdit = attendee.userId === currentUser?.id;
    console.log('DEBUG: canEditAttendee check', { 
      attendeeId: getAttendeeId(attendee), 
      attendeeUserId: attendee.userId, 
      currentUserId: currentUser?.id, 
      canEdit,
      attendeeName: getDisplayName(attendee)
    });
    return canEdit;
  };

  // Check if an attendee is already linked to a family member
  const isAttendeeLinkedToFamily = (attendee: Attendee): boolean => {
    // Bulk-uploaded attendees are never linked to family members
    if (!attendee.userId) {
      return false;
    }
    
    // Check if this is the logged-in user's own entry
    if (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary') {
      return true; // Always consider the user as "linked" to their own family
    }
    
    // Check if attendee has a familyMemberId (direct link) and that member actually exists
    if (attendee.familyMemberId) {
      const exists = userFamilyMembers.some(m => m.id === attendee.familyMemberId);
      if (exists) return true;
    }
    
    // Check if attendee name matches an existing family member
    const matchingFamilyMember = userFamilyMembers.find(familyMember => 
      familyMember.name.toLowerCase() === attendee.name.toLowerCase()
    );
    
    return !!matchingFamilyMember;
  };

  // Group attendees by status (memoized for performance)
  const attendeesByStatus = useMemo(() => ({
    going: attendees.filter(a => a.rsvpStatus === 'going'),
    'not-going': attendees.filter(a => a.rsvpStatus === 'not-going'),
    
    waitlisted: attendees.filter(a => a.rsvpStatus === 'waitlisted')
  }), [attendees]);

  const handleUpdateAttendee = async (attendeeId: string, updateData: any) => {
    try {
      console.log('DEBUG: handleUpdateAttendee called with:', { attendeeId, updateData });

      // Enhanced validation
      if (!attendeeId || typeof attendeeId !== 'string') {
        console.error('Cannot update attendee: attendeeId is invalid', attendeeId);
        toast.error('Unable to update attendee. Please try again.');
        return;
      }
      
      if (!updateData || Object.keys(updateData).length === 0) {
        console.error('Cannot update attendee: no update data provided');
        toast.error('No changes to update.');
        return;
      }
      
      // Find the attendee being updated
      const attendeeToUpdate = attendees.find(a => getAttendeeId(a) === attendeeId);
      if (!attendeeToUpdate) {
        console.error('Cannot update attendee: attendee not found', { attendeeId });
        toast.error('Attendee not found. Please refresh and try again.');
        return;
      }
      
      if (!currentUser) {
        console.error('Cannot update attendee: user not authenticated');
        toast.error('Please log in to update attendees.');
        return;
      }

      let pendingUpdate = { ...updateData };
      updateStatusError(attendeeId);

      // Check if this is a primary member changing to "not-going"
      if (attendeeToUpdate.userId === currentUser.id && 
          attendeeToUpdate.attendeeType === 'primary' && 
          pendingUpdate.rsvpStatus === 'not-going') {
        
        console.log('DEBUG: Primary member changing to not-going - will cascade to family members');
        
        // Business Rule: When primary member changes to "not-going", 
        // all family members should also be set to "not-going"
        const goingFamilyMembers = attendees.filter(
          a => a.userId === currentUser.id && 
               a.attendeeType === 'family_member' && 
               a.rsvpStatus === 'going'
        );
        
        if (goingFamilyMembers.length > 0) {
          console.log(`DEBUG: Found ${goingFamilyMembers.length} family members to update to not-going`);
          
          // Update all family members to "not-going"
          for (const familyMember of goingFamilyMembers) {
            try {
              await updateAttendee(getAttendeeId(familyMember), { rsvpStatus: 'not-going' });
              console.log(`DEBUG: Updated family member ${familyMember.name} to not-going`);
            } catch (error) {
              console.error(`DEBUG: Failed to update family member ${familyMember.name}:`, error);
            }
          }
          
          toast.success(`${goingFamilyMembers.length} family member${goingFamilyMembers.length > 1 ? 's' : ''} automatically marked as "Not Going" since you cannot attend.`);
        }
      }
      
      // Check if this is a family member changing to "going" status
      console.log('DEBUG: Checking if family member changing to going:', {
        attendeeUserId: attendeeToUpdate.userId,
        currentUserId: currentUser.id,
        attendeeType: attendeeToUpdate.attendeeType,
        newStatus: pendingUpdate.rsvpStatus,
        isFamilyMember: attendeeToUpdate.attendeeType === 'family_member',
        isCurrentUser: attendeeToUpdate.userId === currentUser.id,
        isChangingToGoing: pendingUpdate.rsvpStatus === 'going'
      });

      // Check if this is a primary member changing to "going" while at capacity
      if (attendeeToUpdate.userId === currentUser.id &&
          attendeeToUpdate.attendeeType === 'primary' &&
          pendingUpdate.rsvpStatus === 'going') {
        
        if (capacityState?.isAtCapacity) {
          if (capacityState.canWaitlist) {
            console.log('DEBUG: Event at capacity with waitlist - converting primary update to waitlisted');
            pendingUpdate = { ...pendingUpdate, rsvpStatus: 'waitlisted' };
            toast.success('Event is full, so you have been added to the waitlist.');
          } else {
            const blockedMessage = getCapacityBlockedMessage();
            console.log('DEBUG: Blocking primary update due to capacity with no waitlist');
            updateStatusError(attendeeId, blockedMessage);
            toast.error(blockedMessage);
            return;
          }
        }
      }

      if (attendeeToUpdate.userId === currentUser.id && 
          attendeeToUpdate.attendeeType === 'family_member' && 
          pendingUpdate.rsvpStatus === 'going') {
        
        console.log('DEBUG: Family member changing to going - checking primary member status');
        
        // Find the primary member for this user
        const primaryAttendee = attendees.find(
          a => a.userId === currentUser.id && a.attendeeType === 'primary'
        );
        
        console.log('DEBUG: Primary member found:', {
          exists: !!primaryAttendee,
          currentStatus: primaryAttendee?.rsvpStatus
        });
        
        // Business Rule: Family members can only attend if primary member is "going"
        if (!primaryAttendee) {
          console.log('DEBUG: No primary member found - blocking family member');
          const message = 'You must first set yourself to "going" before family members can attend.';
          updateStatusError(attendeeId, message);
          toast.error(message);
          return;
        }
        
        if (primaryAttendee.rsvpStatus !== 'going') {
          console.log('DEBUG: Primary member is not going - checking if we can auto-update');
          
          // Check capacity before attempting to auto-update primary member
          if (capacityState?.isAtCapacity && !capacityState?.canWaitlist) {
            console.log('DEBUG: Event is at capacity with no waitlist - blocking family member');
            const blockedMessage = getCapacityBlockedMessage();
            updateStatusError(attendeeId, blockedMessage);
            toast.error(blockedMessage);
            return;
          }

          console.log('DEBUG: Capacity allows - auto-updating primary member to going');
          try {
            await updateAttendee(getAttendeeId(primaryAttendee), { rsvpStatus: 'going' });
          toast.success('You have been automatically set to "going" since a family member is attending.');
          } catch (primaryUpdateError) {
            const message = primaryUpdateError instanceof Error ? primaryUpdateError.message : String(primaryUpdateError);
            const lowerMessage = message.toLowerCase();

            if (lowerMessage.includes('over capacity') || lowerMessage.includes('cannot change status to "going"') || lowerMessage.includes('event is full')) {
              console.warn('DEBUG: Capacity blocked during primary auto-update:', message);
              const blockedMessage = getCapacityBlockedMessage();
              updateStatusError(attendeeId, blockedMessage);
              toast.error(blockedMessage);
            } else {
              console.error('DEBUG: Failed to auto-update primary member:', primaryUpdateError);
              toast.error('Failed to update your status. Please try again.');
            }
            return;
          }
        }
        
        console.log('DEBUG: Primary member is going - allowing family member to attend');
      }
      
      // Note: We removed the auto-removal logic for family members changing status
      // The primary member should only be removed when they explicitly set their own status to "not-going"
      // This allows the primary member to attend alone without family members
      
      await updateAttendee(attendeeId, pendingUpdate);
      console.log('DEBUG: updateAttendee completed successfully');
      updateStatusError(attendeeId);
      onAttendeeUpdate?.();
    } catch (error) {
      console.error('Failed to update attendee:', error);

      // Robust error message extraction
      let message = 'Unknown error';
      try {
        if (error && typeof error === 'object') {
          if ('message' in error && typeof error.message === 'string') {
            message = error.message;
          } else if ('code' in error && typeof error.code === 'string') {
            message = error.code;
          } else {
            message = String(error);
          }
        } else {
          message = String(error);
        }
      } catch (e) {
        message = 'Error processing error message';
      }

      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes('over capacity') || lowerMessage.includes('cannot change status to "going"') || lowerMessage.includes('event is full')) {
        const blockedMessage = getCapacityBlockedMessage();
        updateStatusError(attendeeId, blockedMessage);
        toast.error(blockedMessage);
        return;
      }
      
      // Enhanced error handling with specific error messages
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          toast.error('You do not have permission to update this attendee.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          toast.error('Network error. Please check your connection and try again.');
        } else if (error.message.includes('indexOf')) {
          toast.error('Invalid attendee data. Please refresh the page and try again.');
        } else {
          toast.error('Failed to update attendee: ' + error.message);
        }
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
    }
  };

  const handleDeleteAttendee = async (attendeeId: string) => {
    try {
      // Find the attendee being deleted
      const attendeeToDelete = attendees.find(a => getAttendeeId(a) === attendeeId);
      if (!attendeeToDelete) return;

      // Remove the attendee
      await removeAttendee(attendeeId);
      
      // Note: We removed the auto-removal logic for primary members when family members are deleted
      // The primary member should only be removed when they explicitly set their own status to "not-going"
      // This allows the primary member to attend alone without family members
      
      onAttendeeUpdate?.();
    } catch (error) {
      console.error('Failed to delete attendee:', error);
    }
  };

  // Status changes are handled inline via handleUpdateAttendee

  // Helper function to check if a primary attendee has family members marked as "going"
  const hasGoingFamilyMembers = (attendee: Attendee): boolean => {
    if (!attendee.userId || attendee.attendeeType !== 'primary') {
      return false;
    }
    
    return attendees.some(
      family =>
        family.userId === attendee.userId &&
        family.attendeeType === 'family_member' &&
        family.rsvpStatus === 'going'
    );
  };

  // Helper function to check if "Going" option should be disabled
  const isGoingOptionDisabled = (attendee: Attendee): boolean => {
    if (attendee.attendeeType === 'primary') {
      // Let primary members attempt the change so we can surface capacity messaging in handleUpdateAttendee
      return false;
    }

    // Check business rules for family members
    if (attendee.attendeeType === 'family_member') {
      // Find the primary member for this user
      const primaryAttendee = attendees.find(
        a => a.userId === attendee.userId && a.attendeeType === 'primary'
      );
      
      // Disable "Going" if primary member is not "going"
      return !primaryAttendee || primaryAttendee.rsvpStatus !== 'going';
    }
    
    return false;
  };

  // Helper function to get tooltip message for disabled options
  const getDisabledTooltip = (attendee: Attendee): string => {
    if (attendee.attendeeType === 'primary') {
      if (capacityState?.isAtCapacity && !capacityState?.canWaitlist) {
        return 'Event is at capacity';
      }
    }
    
    if (attendee.attendeeType === 'family_member') {
      const primaryAttendee = attendees.find(
        a => a.userId === attendee.userId && a.attendeeType === 'primary'
      );
      
      if (!primaryAttendee) {
        return 'You must first set yourself to "going"';
      }
      
      if (primaryAttendee.rsvpStatus !== 'going') {
        return 'You must first set yourself to "going" before family members can attend';
      }
    }
    
    return '';
  };

  // Whether the current user has a primary attendee for this event
  const hasCurrentUserPrimary = useMemo(() => {
    if (!currentUser) return false;
    return attendees.some(a => a.userId === currentUser.id && a.attendeeType === 'primary');
  }, [attendees, currentUser]);

  // Handle adding attendee to family profile
  const handleAddToFamily = async (attendee: Attendee) => {
    if (!currentUser) return;

    try {
      const attendeeIdValue = getAttendeeId(attendee);
      setAddingToFamily(prev => new Set(prev).add(attendeeIdValue));
      // Create or get existing family member
      const fm = await familyMemberService.createFromAttendee(currentUser.id, {
        name: attendee.name,
        ageGroup: attendee.ageGroup,
        relationship: attendee.relationship
      });

      // Link attendee -> familyMemberId and sync name/age for future consistency
      await handleUpdateAttendee(getAttendeeId(attendee), {
        familyMemberId: fm.id,
        name: fm.name,
        ageGroup: (fm.ageGroup as any) || attendee.ageGroup
      });

      toast.success(`${fm.name} added to family and linked!`);
      // Refresh family members so any UI that depends on the list updates
      try { await refreshFamilyMembers(); } catch {}
      // Let parent refresh counts if provided
      onAttendeeUpdate?.();
      
    } catch (error) {
      console.error('Failed to add attendee to family:', error);
      toast.error('Failed to add to family profile. Please try again.');
    } finally {
      const attendeeIdValue = getAttendeeId(attendee);
      setAddingToFamily(prev => {
        const newSet = new Set(prev);
        newSet.delete(attendeeIdValue);
        return newSet;
      });
    }
  };

  // Handle adding the current user as an attendee
  const handleAddYourself = async () => {
    if (!currentUser) {
      toast.error('Please log in to RSVP for events.');
      return;
    }

    try {
      // Check if user already has a primary attendee
      const existingPrimary = attendees.find(
        a => a.userId === currentUser.id && a.attendeeType === 'primary'
      );
      
      if (existingPrimary) {
        toast.error('You are already RSVP\'d for this event.');
        return;
      }

      // Determine the appropriate status based on capacity
      let rsvpStatus: AttendeeStatus = 'going';
      
      if (capacityState?.isAtCapacity) {
        if (capacityState.canWaitlist) {
          rsvpStatus = 'waitlisted';
        } else {
          toast.error('Event is at full capacity and waitlist is not available.');
          return;
        }
      }

      const attendeeData: CreateAttendeeData = {
        eventId: eventId,
        userId: currentUser.id,
        attendeeType: 'primary' as AttendeeType,
        relationship: 'self' as Relationship,
        name: currentUser.displayName || currentUser.firstName || 'You',
        ageGroup: 'adult' as AgeGroup,
        rsvpStatus: rsvpStatus
      };

      await addAttendee(attendeeData);
      
      const statusText = rsvpStatus === 'waitlisted' ? 'added to waitlist' : 'added as going';
      toast.success(`You've been ${statusText}!`);
      
      // Refresh the attendee list
      onAttendeeUpdate?.();
      
    } catch (error) {
      console.error('Failed to add yourself:', error);
      
      // Enhanced error handling with specific error messages
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          toast.error('You do not have permission to RSVP for this event.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          toast.error('Network error. Please check your connection and try again.');
        } else if (error.message.includes('capacity') || error.message.includes('full')) {
          toast.error('Event is at capacity. Please try joining the waitlist.');
        } else {
          toast.error(`Failed to add yourself: ${error.message}`);
        }
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
    }
  };

  // Toggle section collapse
  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600">Loading attendees...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">Error loading attendees: {error}</p>
        <button
          onClick={refreshAttendees}
          className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-[13px]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Yourself CTA when current user has no primary - Show at top */}
      {currentUser && !hasCurrentUserPrimary && (
        <div className="mb-4 p-3 border border-orange-200 rounded-lg bg-orange-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-800">You haven't RSVP'd yet</p>
              <p className="text-xs text-orange-600">Add yourself to this event</p>
            </div>
            <div>
              {capacityState?.isAtCapacity ? (
                capacityState.canWaitlist ? (
                  <button
                    onClick={handleAddYourself}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 text-sm transition-colors"
                  >
                    Join Waitlist
                  </button>
                ) : (
                  <div className="text-sm text-red-600">Event is full and waitlist is not available.</div>
                )
              ) : (
                <button
                  onClick={handleAddYourself}
                  className="px-3 py-1.5 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] text-sm transition-colors"
                >
                  Add Yourself
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendee Lists by Status */}
      <div className="space-y-4">
        {/* Going */}
        {attendeesByStatus.going.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg">
            {/* Collapsible Header */}
            <motion.button
              onClick={() => toggleSection('going')}
              className="w-full p-3 flex items-center justify-between hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h4 className="font-medium text-gray-900 text-[13px]">Going ({attendeesByStatus.going.length})</h4>
              </div>
              <motion.div
                animate={{ rotate: collapsedSections.going ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-gray-500" />
              </motion.div>
            </motion.button>
            
            {/* Collapsible Content */}
            <AnimatePresence>
              {!collapsedSections.going && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-0">
                    {/* Excel-like Table Layout */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                             {/* Table Header */}
                                               <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
                                                     <div className="grid grid-cols-12 gap-2 text-[12px] font-medium text-gray-600">
                             <div className="col-span-4">Name</div>
                             <div className="col-span-3">Age</div>
                             <div className="col-span-3">Status</div>
                             <div className="col-span-2">Actions</div>
                           </div>
                         </div>
                         
                         {/* Table Rows */}
                         <div className="divide-y divide-gray-100">
                           {attendeesByStatus.going.map((attendee, index) => {
                             const attendeeIdValue = getAttendeeId(attendee);
                             const showFamilyWarning = attendee.attendeeType === 'primary' && hasGoingFamilyMembers(attendee);
                             const statusError = statusErrors[attendeeIdValue];
                             const goingOptionDisabled = isGoingOptionDisabled(attendee);

                             return (
                               <div 
                                 key={attendeeIdValue} 
                                 className={`px-3 py-2 hover:bg-green-50 transition-colors ${
                                   index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                 }`}
                               >
                               <div className="grid grid-cols-12 gap-2 items-center">
                                 {/* Name */}
                                 <div className="col-span-4">
                                   <span className="font-medium text-gray-900 text-[13px]">{getDisplayName(attendee)}</span>
                                 </div>
                                 
                                 {/* Age */}
                                 <div className="col-span-3">
                                   <span className="text-[12px] text-gray-500">
                                     {getDisplayAge(attendee) ? `${getDisplayAge(attendee)} years` : 'Not set'}
                                   </span>
                                 </div>
                                 
                                 {/* Status Dropdown */}
                                 <div className="col-span-3">
                                   {canEditAttendee(attendee) ? (
                                     <>
                                       <select
                                         value={attendee.rsvpStatus}
                                         onClick={(e) => {
                                           console.log('DEBUG: Dropdown onClick fired! (Going section)', { 
                                             attendeeId: attendeeIdValue, 
                                             currentValue: attendee.rsvpStatus,
                                             canEdit: canEditAttendee(attendee)
                                           });
                                         }}
                                         onChange={(e) => {
                                           console.log('DEBUG: Dropdown onChange fired! (Going section)', { 
                                             attendeeId: attendeeIdValue, 
                                             newValue: e.target.value,
                                             currentValue: attendee.rsvpStatus 
                                           });
                                           handleUpdateAttendee(attendeeIdValue, { rsvpStatus: e.target.value as AttendeeStatus });
                                         }}
                                         className={`w-full px-1.5 py-0.5 text-[11px] border rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 ${showFamilyWarning ? 'border-yellow-300 bg-yellow-50 focus:ring-yellow-500 focus:border-yellow-500' : 'border-gray-300 bg-white'}`}
                                         title={showFamilyWarning ? 'Changing your status to "Not Going" will also update your family members.' : getDisabledTooltip(attendee)}
                                       >
                                         <option 
                                           value="going" 
                                           className="text-green-700"
                                           disabled={goingOptionDisabled} title={goingOptionDisabled ? getCapacityBlockedMessage() : ''}
                                         >
                                           Going
                                         </option>
                                         <option value="not-going" className="text-red-700">Not Going</option>
                                       </select>
                                       {statusError && (
                                         <p className="mt-1 text-[11px] text-red-600">{statusError}</p>
                                       )}
                                     </>
                                   ) : (
                                     <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-green-100 text-green-800">
                                       Going
                                     </span>
                                   )}
                                 </div>
                                 
                                 {/* Actions */}
                                 <div className="col-span-2">
                                   <div className="flex items-center justify-center gap-1">
                                     {!attendee.userId ? (
                                       <span className="text-xs text-gray-500 italic">Bulk Uploaded</span>
                                     ) : canEditAttendee(attendee) && (
                                       <>
                                         {/* Add to Family Button */}
                                         <button
                                           onClick={() => handleAddToFamily(attendee)}
                                           disabled={
                                             addingToFamily.has(getAttendeeId(attendee)) || 
                                             isAttendeeLinkedToFamily(attendee) ||
                                             (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                           }
                                           className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) || (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={
                                             (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                               ? "This is you - cannot add yourself to family profile"
                                               : isAttendeeLinkedToFamily(attendee) 
                                               ? "Already in Family Profile" 
                                               : "Add to Family Profile"
                                           }
                                         >
                                           {addingToFamily.has(getAttendeeId(attendee)) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) || (canEditAttendee(attendee) && attendee.attendeeType === 'primary') ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button - Disabled for primary members */}
                                         <button
                                           onClick={() => handleDeleteAttendee(getAttendeeId(attendee))}
                                           disabled={attendee.attendeeType === 'primary'}
                                           className={`px-1 py-0.5 rounded flex items-center justify-center transition-colors ${
                                             attendee.attendeeType === 'primary' 
                                               ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                               : 'bg-gray-600 text-white hover:bg-gray-700'
                                           }`}
                                           title={attendee.attendeeType === 'primary' ? 'Primary member cannot be removed' : 'Remove'}
                                         >
                                           <Trash2 className="w-3 h-3" />
                                         </button>
                                       </>
                                     )}
                                   </div>
                                 </div>
                               </div>
                             </div>
                           );
                         })}
                         </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Waitlisted */}
        {attendeesByStatus.waitlisted.length > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg">
            <motion.button
              onClick={() => toggleSection('waitlisted')}
              className="w-full p-3 flex items-center justify-between hover:bg-purple-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <h4 className="font-medium text-gray-900 text-[13px]">
                  Waitlisted ({attendeesByStatus.waitlisted.length})
                </h4>
              </div>
              <motion.div
                animate={{ rotate: collapsedSections.waitlisted ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-gray-500" />
              </motion.div>
            </motion.button>

            <AnimatePresence>
              {!collapsedSections.waitlisted && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-0">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
                        <div className="grid grid-cols-12 gap-2 text-[12px] font-medium text-gray-600">
                          <div className="col-span-4">Name</div>
                          <div className="col-span-3">Age</div>
                          <div className="col-span-3">Status</div>
                          <div className="col-span-2">Actions</div>
                        </div>
                      </div>

                      <div className="divide-y divide-gray-100">
                        {attendeesByStatus.waitlisted.map((attendee, index) => {
                          const attendeeIdValue = getAttendeeId(attendee);
                          const statusError = statusErrors[attendeeIdValue];
                          const goingOptionDisabled = isGoingOptionDisabled(attendee);
                          const waitlistPosition = getWaitlistPosition(attendee);

                          return (
                            <div
                              key={attendeeIdValue}
                              className={`px-3 py-2 hover:bg-purple-50 transition-colors ${
                                index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                              }`}
                            >
                              <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-4">
                                  <span className="font-medium text-gray-900 text-[13px]">{getDisplayName(attendee)}</span>
                                  {waitlistPosition !== null && (
                                    <span className="block text-[11px] text-purple-600 mt-0.5">
                                      Position #{waitlistPosition}
                                    </span>
                                  )}
                                </div>

                                <div className="col-span-3">
                                  <span className="text-[12px] text-gray-500">
                                    {getDisplayAge(attendee) ? `${getDisplayAge(attendee)} years` : 'Not set'}
                                  </span>
                                </div>

                                <div className="col-span-3">
                                  {canEditAttendee(attendee) ? (
                                    <>
                                      <select
                                        value={attendee.rsvpStatus}
                                        onClick={() => {
                                          console.log('DEBUG: Dropdown onClick fired! (Waitlisted section)', {
                                            attendeeId: attendeeIdValue,
                                            currentValue: attendee.rsvpStatus,
                                            canEdit: canEditAttendee(attendee)
                                          });
                                        }}
                                        onChange={(e) => {
                                          console.log('DEBUG: Dropdown onChange fired! (Waitlisted section)', {
                                            attendeeId: attendeeIdValue,
                                            newValue: e.target.value,
                                            currentValue: attendee.rsvpStatus
                                          });
                                          handleUpdateAttendee(attendeeIdValue, { rsvpStatus: e.target.value as AttendeeStatus });
                                        }}
                                        className="w-full px-1.5 py-0.5 text-[11px] border border-purple-300 bg-white rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                        title={getDisabledTooltip(attendee)}
                                      >
                                        <option
                                          value="going"
                                          className="text-green-700"
                                          disabled={goingOptionDisabled}
                                          title={goingOptionDisabled ? getCapacityBlockedMessage() : ''}
                                        >
                                          Going
                                        </option>
                                        <option value="not-going" className="text-red-700">
                                          Not Going
                                        </option>
                                        <option value="waitlisted" className="text-purple-700">
                                          Waitlisted
                                        </option>
                                      </select>
                                      {statusError && <p className="mt-1 text-[11px] text-red-600">{statusError}</p>}
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-purple-100 text-purple-800">
                                      Waitlisted
                                    </span>
                                  )}
                                </div>

                                <div className="col-span-2">
                                  <div className="flex items-center justify-center gap-1">
                                    {!attendee.userId ? (
                                      <span className="text-xs text-gray-500 italic">Bulk Uploaded</span>
                                    ) : (
                                      canEditAttendee(attendee) && (
                                        <>
                                          <button
                                            onClick={() => handleAddToFamily(attendee)}
                                            disabled={
                                              addingToFamily.has(getAttendeeId(attendee)) ||
                                              isAttendeeLinkedToFamily(attendee) ||
                                              (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                            }
                                            className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                              isAttendeeLinkedToFamily(attendee) || (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                                ? 'bg-green-100 text-green-600 cursor-not-allowed'
                                                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                            }`}
                                            title={
                                              (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                                ? 'This is you - cannot add yourself to family profile'
                                                : isAttendeeLinkedToFamily(attendee)
                                                ? 'Already in Family Profile'
                                                : 'Add to Family Profile'
                                            }
                                          >
                                            {addingToFamily.has(getAttendeeId(attendee)) ? (
                                              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            ) : isAttendeeLinkedToFamily(attendee) || (canEditAttendee(attendee) && attendee.attendeeType === 'primary') ? (
                                              <CheckCircle className="w-3 h-3" />
                                            ) : (
                                              <Heart className="w-3 h-3" />
                                            )}
                                          </button>

                                          <button
                                            onClick={() => handleDeleteAttendee(getAttendeeId(attendee))}
                                            disabled={attendee.attendeeType === 'primary'}
                                            className={`px-1 py-0.5 rounded flex items-center justify-center transition-colors ${
                                              attendee.attendeeType === 'primary'
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                : 'bg-gray-600 text-white hover:bg-gray-700'
                                            }`}
                                            title={attendee.attendeeType === 'primary' ? 'Primary member cannot be removed' : 'Remove'}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Not Going */}
        {attendeesByStatus['not-going'].length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg">
            {/* Collapsible Header */}
            <motion.button
              onClick={() => toggleSection('notGoing')}
              className="w-full p-3 flex items-center justify-between hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <h4 className="font-medium text-gray-900 text-[13px]">Not Going ({attendeesByStatus['not-going'].length})</h4>
              </div>
              <motion.div
                animate={{ rotate: collapsedSections.notGoing ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-gray-500" />
              </motion.div>
            </motion.button>
            
            {/* Collapsible Content */}
            <AnimatePresence>
              {!collapsedSections.notGoing && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-0">
                    {/* Excel-like Table Layout */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                             {/* Table Header */}
                                               <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
                                                     <div className="grid grid-cols-12 gap-2 text-[12px] font-medium text-gray-600">
                             <div className="col-span-4">Name</div>
                             <div className="col-span-3">Age</div>
                             <div className="col-span-3">Status</div>
                             <div className="col-span-2">Actions</div>
                           </div>
                         </div>
                         
                         {/* Table Rows */}
                         <div className="divide-y divide-gray-100">
                           {attendeesByStatus['not-going'].map((attendee, index) => {
                             const attendeeIdValue = getAttendeeId(attendee);
                             const showFamilyWarning = attendee.attendeeType === 'primary' && hasGoingFamilyMembers(attendee);
                             const statusError = statusErrors[attendeeIdValue];
                             const goingOptionDisabled = isGoingOptionDisabled(attendee);

                             return (
                               <div 
                                 key={attendeeIdValue} 
                                 className={`px-3 py-2 hover:bg-red-50 transition-colors ${
                                   index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                 }`}
                               >
                                 <div className="grid grid-cols-12 gap-2 items-center">
                                   {/* Name */}
                                   <div className="col-span-4">
                                     <span className="font-medium text-gray-900 text-[13px]">{getDisplayName(attendee)}</span>
                                   </div>
                                   
                                   {/* Age */}
                                   <div className="col-span-3">
                                     <span className="text-[12px] text-gray-500">
                                       {getDisplayAge(attendee) ? `${getDisplayAge(attendee)} years` : 'Not set'}
                                     </span>
                                   </div>
                                   
                                   {/* Status Dropdown */}
                                   <div className="col-span-3">
                                     {canEditAttendee(attendee) ? (
                                       <>
                                         <select
                                           value={attendee.rsvpStatus}
                                           onClick={(e) => {
                                             console.log('DEBUG: Dropdown onClick fired! (Not Going section)', { 
                                               attendeeId: attendeeIdValue, 
                                               currentValue: attendee.rsvpStatus,
                                               canEdit: canEditAttendee(attendee)
                                             });
                                           }}
                                           onChange={(e) => {
                                             console.log('DEBUG: Dropdown onChange fired! (Not Going section)', { 
                                               attendeeId: attendeeIdValue, 
                                               newValue: e.target.value,
                                               currentValue: attendee.rsvpStatus 
                                             });
                                             handleUpdateAttendee(attendeeIdValue, { rsvpStatus: e.target.value as AttendeeStatus });
                                           }}
                                           className={`w-full px-1.5 py-0.5 text-[11px] border rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 ${
                                             showFamilyWarning 
                                               ? 'border-yellow-300 bg-yellow-50 focus:ring-yellow-500 focus:border-yellow-500' 
                                               : 'border-red-300 bg-white'
                                           }`}
                                           title={showFamilyWarning ? 'Changing your status to "Not Going" will also update your family members.' : getDisabledTooltip(attendee)}
                                         >
                                           <option 
                                             value="going" 
                                             className="text-green-700"
                                             disabled={goingOptionDisabled} title={goingOptionDisabled ? getCapacityBlockedMessage() : ''}
                                           >
                                             Going
                                           </option>
                                           <option value="not-going" className="text-red-700">Not Going</option>
                                         </select>
                                         {statusError && (
                                           <p className="mt-1 text-[11px] text-red-600">{statusError}</p>
                                         )}
                                       </>
                                     ) : (
                                       <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-red-100 text-red-800">
                                         Not Going
                                       </span>
                                     )}
                                   </div>
                                 
                                 {/* Actions */}
                                 <div className="col-span-2">
                                   <div className="flex items-center justify-center gap-1">
                                     {!attendee.userId ? (
                                       <span className="text-xs text-gray-500 italic">Bulk Uploaded</span>
                                     ) : canEditAttendee(attendee) && (
                                       <>
                                         {/* Add to Family Button */}
                                         <button
                                           onClick={() => handleAddToFamily(attendee)}
                                           disabled={
                                             addingToFamily.has(getAttendeeId(attendee)) || 
                                             isAttendeeLinkedToFamily(attendee) ||
                                             (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                           }
                                           className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) || (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={
                                             (canEditAttendee(attendee) && attendee.attendeeType === 'primary')
                                               ? "This is you - cannot add yourself to family profile"
                                               : isAttendeeLinkedToFamily(attendee) 
                                               ? "Already in Family Profile" 
                                               : "Add to Family Profile"
                                           }
                                         >
                                           {addingToFamily.has(getAttendeeId(attendee)) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) || (canEditAttendee(attendee) && attendee.attendeeType === 'primary') ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button - Disabled for primary members */}
                                         <button
                                           onClick={() => handleDeleteAttendee(getAttendeeId(attendee))}
                                           disabled={attendee.attendeeType === 'primary'}
                                           className={`px-1 py-0.5 rounded flex items-center justify-center transition-colors ${
                                             attendee.attendeeType === 'primary' 
                                               ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                               : 'bg-gray-600 text-white hover:bg-gray-700'
                                           }`}
                                           title={attendee.attendeeType === 'primary' ? 'Primary member cannot be removed' : 'Remove'}
                                         >
                                           <Trash2 className="w-3 h-3" />
                                         </button>
                                       </>
                                     )}
                                   </div>
                                 </div>
                               </div>
                             </div>
                           );
                         })}
                         </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* No attendees */}
        {attendees.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="mb-4">No attendees found</p>
              </div>
        )}
                           </div>
                         </div>
  );
};














