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
  AttendeeStatus
} from '../../types/attendee';
import { useAuth } from '../../contexts/AuthContext';
import { familyMemberService } from '../../services/familyMemberService';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';
import toast from 'react-hot-toast';

interface AttendeeListProps {
  eventId: string;
  onAttendeeUpdate?: () => void;
  isAdmin?: boolean;
}

export const AttendeeList: React.FC<AttendeeListProps> = ({ 
  eventId, 
  onAttendeeUpdate,
  isAdmin = false
}) => {
  const { currentUser } = useAuth();
  const { 
    attendees, 
    loading, 
    error, 
    updateAttendee, 
    removeAttendee, 
    refreshAttendees 
  } = useAttendees(eventId, currentUser?.id || '', isAdmin);


  
  // Collapsible state for each section
  const [collapsedSections, setCollapsedSections] = useState({
    going: false,
    notGoing: false,
    pending: false
  });

  // State for tracking attendees being added to family
  const [addingToFamily, setAddingToFamily] = useState<Set<string>>(new Set());

  // Get family members to check if attendees are already linked
  const { familyMembers: userFamilyMembers, refreshFamilyMembers } = useFamilyMembers();

  // Build a quick lookup so we can show live names/ages when family records are renamed
  const familyMemberById = useMemo(() => {
    const map = new Map<string, { name: string; ageGroup?: string }>();
    userFamilyMembers.forEach(m => map.set(m.id, { name: m.name, ageGroup: m.ageGroup }));
    return map;
  }, [userFamilyMembers]);

  const getDisplayName = (attendee: Attendee): string => {
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

  // Check if an attendee is already linked to a family member
  const isAttendeeLinkedToFamily = (attendee: Attendee): boolean => {
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
    pending: attendees.filter(a => a.rsvpStatus === 'pending')
  }), [attendees]);

  const handleUpdateAttendee = async (attendeeId: string, updateData: any) => {
    try {
      console.log('DEBUG: handleUpdateAttendee called with:', { attendeeId, updateData });
      
      // Find the attendee being updated
      const attendeeToUpdate = attendees.find(a => a.attendeeId === attendeeId);
      if (!attendeeToUpdate || !currentUser) {
        await updateAttendee(attendeeId, updateData);
        onAttendeeUpdate?.();
        return;
      }
      
      // Check if this is a primary member trying to change status
      if (attendeeToUpdate.userId === currentUser.id && 
          attendeeToUpdate.attendeeType === 'primary' && 
          updateData.rsvpStatus && 
          updateData.rsvpStatus !== 'going') {
        
        // Check if there are any family members marked as "going"
        const goingFamilyMembers = attendees.filter(
          a => a.userId === currentUser.id && 
               a.attendeeType === 'family_member' && 
               a.rsvpStatus === 'going'
        );
        
        if (goingFamilyMembers.length > 0) {
          toast.error('You cannot change your status to "not going" or "pending" while family members are marked as "going". Please remove family members first or change their status.');
          return;
        }
      }
      
      // Check if this is a family member changing to "going" status
      console.log('DEBUG: Checking if family member changing to going:', {
        attendeeUserId: attendeeToUpdate.userId,
        currentUserId: currentUser.id,
        attendeeType: attendeeToUpdate.attendeeType,
        newStatus: updateData.rsvpStatus,
        isFamilyMember: attendeeToUpdate.attendeeType === 'family_member',
        isCurrentUser: attendeeToUpdate.userId === currentUser.id,
        isChangingToGoing: updateData.rsvpStatus === 'going'
      });
      
      if (attendeeToUpdate.userId === currentUser.id && 
          attendeeToUpdate.attendeeType === 'family_member' && 
          updateData.rsvpStatus === 'going') {
        
        console.log('DEBUG: Family member changing to going - looking for primary member');
        
        // Find the primary member for this user
        const primaryAttendee = attendees.find(
          a => a.userId === currentUser.id && a.attendeeType === 'primary'
        );
        
        console.log('DEBUG: Primary member found:', {
          exists: !!primaryAttendee,
          currentStatus: primaryAttendee?.rsvpStatus,
          needsUpdate: primaryAttendee && primaryAttendee.rsvpStatus !== 'going'
        });
        
        // If primary member exists and is not already "going", update them to "going"
        if (primaryAttendee && primaryAttendee.rsvpStatus !== 'going') {
          console.log('DEBUG: Auto-updating primary member to going status');
          await updateAttendee(primaryAttendee.attendeeId, { rsvpStatus: 'going' });
          toast.success('You have been automatically set to "going" since a family member is attending.');
        }
      }
      
      // Note: We removed the auto-removal logic for family members changing status
      // The primary member should only be removed when they explicitly set their own status to "not-going"
      // This allows the primary member to attend alone without family members
      
      await updateAttendee(attendeeId, updateData);
      console.log('DEBUG: updateAttendee completed successfully');
      onAttendeeUpdate?.();
    } catch (error) {
      console.error('Failed to update attendee:', error);
    }
  };

  const handleDeleteAttendee = async (attendeeId: string) => {
    try {
      // Find the attendee being deleted
      const attendeeToDelete = attendees.find(a => a.attendeeId === attendeeId);
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

  // Helper function to check if primary member status should be locked
  const isPrimaryMemberStatusLocked = (attendee: Attendee): boolean => {
    if (!currentUser || attendee.userId !== currentUser.id || attendee.attendeeType !== 'primary') {
      return false;
    }
    
    // Check if there are any family members marked as "going"
    const goingFamilyMembers = attendees.filter(
      a => a.userId === currentUser.id && 
           a.attendeeType === 'family_member' && 
           a.rsvpStatus === 'going'
    );
    
    return goingFamilyMembers.length > 0;
  };

  // Handle adding attendee to family profile
  const handleAddToFamily = async (attendee: Attendee) => {
    if (!currentUser) return;

    try {
      setAddingToFamily(prev => new Set(prev).add(attendee.attendeeId));
      // Create or get existing family member
      const fm = await familyMemberService.createFromAttendee(currentUser.id, {
        name: attendee.name,
        ageGroup: attendee.ageGroup,
        relationship: attendee.relationship
      });

      // Link attendee -> familyMemberId and sync name/age for future consistency
      await handleUpdateAttendee(attendee.attendeeId, {
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
      setAddingToFamily(prev => {
        const newSet = new Set(prev);
        newSet.delete(attendee.attendeeId);
        return newSet;
      });
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
                           {attendeesByStatus.going.map((attendee, index) => (
                             <div 
                               key={attendee.attendeeId} 
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
                                   {attendee.userId === currentUser?.id ? (
                                     <select
                                       value={attendee.rsvpStatus}
                                       onChange={(e) => handleUpdateAttendee(attendee.attendeeId, { rsvpStatus: e.target.value as AttendeeStatus })}
                                       disabled={isPrimaryMemberStatusLocked(attendee)}
                                       className={`w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 ${
                                         isPrimaryMemberStatusLocked(attendee) 
                                           ? 'bg-gray-100 cursor-not-allowed opacity-75' 
                                           : 'bg-white'
                                       }`}
                                       title={isPrimaryMemberStatusLocked(attendee) ? 'Status locked because family members are attending' : ''}
                                     >
                                       <option value="going" className="text-green-700">Going</option>
                                       <option value="not-going" className="text-red-700">Not Going</option>
                                       <option value="pending" className="text-yellow-700">Pending</option>
                                     </select>
                                   ) : (
                                     <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-green-100 text-green-800">
                                       Going
                                     </span>
                                   )}
                                 </div>
                                 
                                 {/* Actions */}
                                 <div className="col-span-2">
                                   <div className="flex items-center justify-center gap-1">
                                     {attendee.userId === currentUser?.id && (
                                       <>
                                         {/* Add to Family Button */}
                                         <button
                                           onClick={() => handleAddToFamily(attendee)}
                                           disabled={
                                             addingToFamily.has(attendee.attendeeId) || 
                                             isAttendeeLinkedToFamily(attendee) ||
                                             (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                           }
                                           className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) || (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={
                                             (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                               ? "This is you - cannot add yourself to family profile"
                                               : isAttendeeLinkedToFamily(attendee) 
                                               ? "Already in Family Profile" 
                                               : "Add to Family Profile"
                                           }
                                         >
                                           {addingToFamily.has(attendee.attendeeId) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) || (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary') ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button - Disabled for primary members */}
                                         <button
                                           onClick={() => handleDeleteAttendee(attendee.attendeeId)}
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
                           ))}
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
                           {attendeesByStatus['not-going'].map((attendee, index) => (
                             <div 
                               key={attendee.attendeeId} 
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
                                   {attendee.userId === currentUser?.id ? (
                                     <select
                                       value={attendee.rsvpStatus}
                                       onChange={(e) => handleUpdateAttendee(attendee.attendeeId, { rsvpStatus: e.target.value as AttendeeStatus })}
                                       disabled={isPrimaryMemberStatusLocked(attendee)}
                                       className={`w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 ${
                                         isPrimaryMemberStatusLocked(attendee) 
                                           ? 'bg-gray-100 cursor-not-allowed opacity-75' 
                                           : 'bg-white'
                                       }`}
                                       title={isPrimaryMemberStatusLocked(attendee) ? 'Status locked because family members are attending' : ''}
                                     >
                                       <option value="going" className="text-green-700">Going</option>
                                       <option value="not-going" className="text-red-700">Not Going</option>
                                       <option value="pending" className="text-yellow-700">Pending</option>
                                     </select>
                                   ) : (
                                     <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-red-100 text-red-800">
                                       Not Going
                                     </span>
                                   )}
                                 </div>
                                 
                                 {/* Actions */}
                                 <div className="col-span-2">
                                   <div className="flex items-center justify-center gap-1">
                                     {attendee.userId === currentUser?.id && (
                                       <>
                                         {/* Add to Family Button */}
                                         <button
                                           onClick={() => handleAddToFamily(attendee)}
                                           disabled={
                                             addingToFamily.has(attendee.attendeeId) || 
                                             isAttendeeLinkedToFamily(attendee) ||
                                             (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                           }
                                           className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) || (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={
                                             (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                               ? "This is you - cannot add yourself to family profile"
                                               : isAttendeeLinkedToFamily(attendee) 
                                               ? "Already in Family Profile" 
                                               : "Add to Family Profile"
                                           }
                                         >
                                           {addingToFamily.has(attendee.attendeeId) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) || (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary') ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button - Disabled for primary members */}
                                         <button
                                           onClick={() => handleDeleteAttendee(attendee.attendeeId)}
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
                           ))}
                         </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Pending */}
        {attendeesByStatus.pending.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg">
            {/* Collapsible Header */}
            <motion.button
              onClick={() => toggleSection('pending')}
              className="w-full p-3 flex items-center justify-between hover:bg-yellow-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-600" />
                <h4 className="font-medium text-gray-900 text-[13px]">Pending ({attendeesByStatus.pending.length})</h4>
              </div>
              <motion.div
                animate={{ rotate: collapsedSections.pending ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-gray-500" />
              </motion.div>
            </motion.button>
            
            {/* Collapsible Content */}
            <AnimatePresence>
              {!collapsedSections.pending && (
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
                           {attendeesByStatus.pending.map((attendee, index) => (
                             <div 
                               key={attendee.attendeeId} 
                               className={`px-3 py-2 hover:bg-yellow-50 transition-colors ${
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
                                   {attendee.userId === currentUser?.id ? (
                                     <select
                                       value={attendee.rsvpStatus}
                                       onChange={(e) => handleUpdateAttendee(attendee.attendeeId, { rsvpStatus: e.target.value as AttendeeStatus })}
                                       disabled={isPrimaryMemberStatusLocked(attendee)}
                                       className={`w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 ${
                                         isPrimaryMemberStatusLocked(attendee) 
                                           ? 'bg-gray-100 cursor-not-allowed opacity-75' 
                                           : 'bg-white'
                                       }`}
                                       title={isPrimaryMemberStatusLocked(attendee) ? 'Status locked because family members are attending' : ''}
                                     >
                                       <option value="going" className="text-green-700">Going</option>
                                       <option value="not-going" className="text-red-700">Not Going</option>
                                       <option value="pending" className="text-yellow-700">Pending</option>
                                     </select>
                                   ) : (
                                     <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-yellow-100 text-yellow-800">
                                       Pending
                                     </span>
                                   )}
                                 </div>
                                 
                                 {/* Actions */}
                                 <div className="col-span-2">
                                   <div className="flex items-center justify-center gap-1">
                                     {attendee.userId === currentUser?.id && (
                                       <>
                                         {/* Add to Family Button */}
                                         <button
                                           onClick={() => handleAddToFamily(attendee)}
                                           disabled={
                                             addingToFamily.has(attendee.attendeeId) || 
                                             isAttendeeLinkedToFamily(attendee) ||
                                             (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                           }
                                           className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) || (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={
                                             (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary')
                                               ? "This is you - cannot add yourself to family profile"
                                               : isAttendeeLinkedToFamily(attendee) 
                                               ? "Already in Family Profile" 
                                               : "Add to Family Profile"
                                           }
                                         >
                                           {addingToFamily.has(attendee.attendeeId) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) || (attendee.userId === currentUser?.id && attendee.attendeeType === 'primary') ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button - Disabled for primary members */}
                                         <button
                                           onClick={() => handleDeleteAttendee(attendee.attendeeId)}
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
                           ))}
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
            <p>No attendees found</p>
          </div>
        )}
      </div>
    </div>
  );
};
