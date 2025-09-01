import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Users, 
  Search, 
  Filter, 
  RefreshCw,
  UserPlus,
  Baby,
  Star,
  User,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  Trash2,
  Heart
} from 'lucide-react';
import { AttendeeItem } from './AttendeeItem';
import { useAttendees } from '../../hooks/useAttendees';
import { 
  Attendee, 
  CreateAttendeeData, 
  AttendeeStatus, 
  AgeGroup, 
  Relationship,
  AttendeeType 
} from '../../types/attendee';
import { useAuth } from '../../contexts/AuthContext';
import { familyMemberService } from '../../services/familyMemberService';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';
import toast from 'react-hot-toast';

interface AttendeeListProps {
  eventId: string;
  onAttendeeUpdate?: () => void;
}

export const AttendeeList: React.FC<AttendeeListProps> = ({ 
  eventId, 
  onAttendeeUpdate 
}) => {
  const { currentUser } = useAuth();
  const { 
    attendees, 
    counts, 
    loading, 
    error, 
    addAttendee, 
    updateAttendee, 
    removeAttendee, 
    setAttendeeStatus,
    refreshAttendees 
  } = useAttendees(eventId);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendeeStatus | 'all'>('all');
  
  // Collapsible state for each section
  const [collapsedSections, setCollapsedSections] = useState({
    going: false,
    notGoing: false,
    pending: false
  });

  // State for tracking attendees being added to family
  const [addingToFamily, setAddingToFamily] = useState<Set<string>>(new Set());

  // Get family members to check if attendees are already linked
  const { familyMembers: userFamilyMembers } = useFamilyMembers();

  // Check if an attendee is already linked to a family member
  const isAttendeeLinkedToFamily = (attendee: Attendee): boolean => {
    // Check if attendee has a familyMemberId (direct link)
    if (attendee.familyMemberId) {
      return true;
    }
    
    // Check if attendee name matches an existing family member
    const matchingFamilyMember = userFamilyMembers.find(familyMember => 
      familyMember.name.toLowerCase() === attendee.name.toLowerCase()
    );
    
    return !!matchingFamilyMember;
  };

  // Filter attendees based on search and status
  const filteredAttendees = attendees.filter(attendee => {
    const matchesSearch = attendee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         attendee.relationship.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || attendee.rsvpStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Group attendees by status
  const attendeesByStatus = {
    going: filteredAttendees.filter(a => a.rsvpStatus === 'going'),
    'not-going': filteredAttendees.filter(a => a.rsvpStatus === 'not-going'),
    pending: filteredAttendees.filter(a => a.rsvpStatus === 'pending')
  };

  const handleUpdateAttendee = async (attendeeId: string, updateData: any) => {
    try {
      await updateAttendee(attendeeId, updateData);
      onAttendeeUpdate?.();
    } catch (error) {
      console.error('Failed to update attendee:', error);
    }
  };

  const handleDeleteAttendee = async (attendeeId: string) => {
    try {
      await removeAttendee(attendeeId);
      onAttendeeUpdate?.();
    } catch (error) {
      console.error('Failed to delete attendee:', error);
    }
  };

  const handleStatusChange = async (attendeeId: string, status: AttendeeStatus) => {
    try {
      await setAttendeeStatus(attendeeId, status);
      onAttendeeUpdate?.();
    } catch (error) {
      console.error('Failed to change attendee status:', error);
    }
  };

  // Handle adding attendee to family profile
  const handleAddToFamily = async (attendee: Attendee) => {
    if (!currentUser) return;

    try {
      setAddingToFamily(prev => new Set(prev).add(attendee.attendeeId));
      
      await familyMemberService.createFromAttendee(currentUser.id, {
        name: attendee.name,
        ageGroup: attendee.ageGroup,
        relationship: attendee.relationship
      });

      // Show success message
      toast.success(`${attendee.name} added to family profile!`);
      
      // Refresh attendees to update UI
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
          className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search attendees by name or relationship..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AttendeeStatus | 'all')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="all">All Statuses</option>
          <option value="going">Going</option>
          <option value="not-going">Not Going</option>
          <option value="pending">Pending</option>
        </select>
      </div>

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
                <h4 className="font-medium text-gray-900">Going ({attendeesByStatus.going.length})</h4>
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
                                               <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                                     <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
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
                               className={`px-3 py-2.5 hover:bg-green-50 transition-colors ${
                                 index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                               }`}
                             >
                               <div className="grid grid-cols-12 gap-2 items-center">
                                 {/* Name */}
                                 <div className="col-span-4">
                                   <span className="font-medium text-gray-900 text-sm">{attendee.name}</span>
                                 </div>
                                 
                                 {/* Age */}
                                 <div className="col-span-3">
                                   <span className="text-xs text-gray-500">
                                     {attendee.ageGroup ? `${attendee.ageGroup} years` : 'Not set'}
                                   </span>
                                 </div>
                                 
                                 {/* Status Dropdown */}
                                 <div className="col-span-3">
                                   {attendee.userId === currentUser?.id ? (
                                     <select
                                       value={attendee.rsvpStatus}
                                       onChange={(e) => handleUpdateAttendee(attendee.attendeeId, { rsvpStatus: e.target.value as AttendeeStatus })}
                                       className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
                                     >
                                       <option value="going" className="text-green-700">Going</option>
                                       <option value="not-going" className="text-red-700">Not Going</option>
                                       <option value="pending" className="text-yellow-700">Pending</option>
                                     </select>
                                   ) : (
                                     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
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
                                           disabled={addingToFamily.has(attendee.attendeeId) || isAttendeeLinkedToFamily(attendee)}
                                           className={`px-2 py-1 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) 
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={isAttendeeLinkedToFamily(attendee) ? "Already in Family Profile" : "Add to Family Profile"}
                                         >
                                           {addingToFamily.has(attendee.attendeeId) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button */}
                                         <button
                                           onClick={() => handleDeleteAttendee(attendee.attendeeId)}
                                           className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center justify-center"
                                           title="Remove"
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
                <h4 className="font-medium text-gray-900">Not Going ({attendeesByStatus['not-going'].length})</h4>
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
                                               <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                                     <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
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
                               className={`px-3 py-2.5 hover:bg-red-50 transition-colors ${
                                 index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                               }`}
                             >
                               <div className="grid grid-cols-12 gap-2 items-center">
                                 {/* Name */}
                                 <div className="col-span-4">
                                   <span className="font-medium text-gray-900 text-sm">{attendee.name}</span>
                                 </div>
                                 
                                 {/* Age */}
                                 <div className="col-span-3">
                                   <span className="text-xs text-gray-500">
                                     {attendee.ageGroup ? `${attendee.ageGroup} years` : 'Not set'}
                                   </span>
                                 </div>
                                 
                                 {/* Status Dropdown */}
                                 <div className="col-span-3">
                                   {attendee.userId === currentUser?.id ? (
                                     <select
                                       value={attendee.rsvpStatus}
                                       onChange={(e) => handleUpdateAttendee(attendee.attendeeId, { rsvpStatus: e.target.value as AttendeeStatus })}
                                       className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white"
                                     >
                                       <option value="going" className="text-green-700">Going</option>
                                       <option value="not-going" className="text-red-700">Not Going</option>
                                       <option value="pending" className="text-yellow-700">Pending</option>
                                     </select>
                                   ) : (
                                     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
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
                                           disabled={addingToFamily.has(attendee.attendeeId) || isAttendeeLinkedToFamily(attendee)}
                                           className={`px-2 py-1 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) 
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={isAttendeeLinkedToFamily(attendee) ? "Already in Family Profile" : "Add to Family Profile"}
                                         >
                                           {addingToFamily.has(attendee.attendeeId) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button */}
                                         <button
                                           onClick={() => handleDeleteAttendee(attendee.attendeeId)}
                                           className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center justify-center"
                                           title="Remove"
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
                <h4 className="font-medium text-gray-900">Pending ({attendeesByStatus.pending.length})</h4>
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
                                               <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                                     <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
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
                               className={`px-3 py-2.5 hover:bg-yellow-50 transition-colors ${
                                 index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                               }`}
                             >
                               <div className="grid grid-cols-12 gap-2 items-center">
                                 {/* Name */}
                                 <div className="col-span-4">
                                   <span className="font-medium text-gray-900 text-sm">{attendee.name}</span>
                                 </div>
                                 
                                 {/* Age */}
                                 <div className="col-span-3">
                                   <span className="text-xs text-gray-500">
                                     {attendee.ageGroup ? `${attendee.ageGroup} years` : 'Not set'}
                                   </span>
                                 </div>
                                 
                                 {/* Status Dropdown */}
                                 <div className="col-span-3">
                                   {attendee.userId === currentUser?.id ? (
                                     <select
                                       value={attendee.rsvpStatus}
                                       onChange={(e) => handleUpdateAttendee(attendee.attendeeId, { rsvpStatus: e.target.value as AttendeeStatus })}
                                       className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 bg-white"
                                     >
                                       <option value="going" className="text-green-700">Going</option>
                                       <option value="not-going" className="text-red-700">Not Going</option>
                                       <option value="pending" className="text-yellow-700">Pending</option>
                                     </select>
                                   ) : (
                                     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
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
                                           disabled={addingToFamily.has(attendee.attendeeId) || isAttendeeLinkedToFamily(attendee)}
                                           className={`px-2 py-1 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                                             isAttendeeLinkedToFamily(attendee) 
                                               ? 'bg-green-100 text-green-600 cursor-not-allowed' 
                                               : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                           }`}
                                           title={isAttendeeLinkedToFamily(attendee) ? "Already in Family Profile" : "Add to Family Profile"}
                                         >
                                           {addingToFamily.has(attendee.attendeeId) ? (
                                             <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                           ) : isAttendeeLinkedToFamily(attendee) ? (
                                             <CheckCircle className="w-3 h-3" />
                                           ) : (
                                             <Heart className="w-3 h-3" />
                                           )}
                                         </button>
                                         
                                         {/* Delete Button */}
                                         <button
                                           onClick={() => handleDeleteAttendee(attendee.attendeeId)}
                                           className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center justify-center"
                                           title="Remove"
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
        {filteredAttendees.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No attendees found</p>
            {searchTerm && (
              <p className="text-sm">Try adjusting your search criteria</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
