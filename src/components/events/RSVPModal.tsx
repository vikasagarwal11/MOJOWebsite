import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Users, Baby, FileText, CheckCircle, XCircle, AlertTriangle, Calendar, MapPin, Clock, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RSVPStatus, RSVPDoc } from '../../types/rsvp';

// Age group types for children
type ChildAgeGroup = '0-2' | '3-5' | '6-10' | '11+';

interface ChildCount {
  ageGroup: ChildAgeGroup;
  count: number;
}

interface GuestInfo {
  name: string;
  phone: string;
  email: string;
  ageGroup: ChildAgeGroup;
}
import { EventDoc } from '../../hooks/useEvents';
import { useAuth } from '../../contexts/AuthContext';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';
import { useUserBlocking } from '../../hooks/useUserBlocking';
import { format } from 'date-fns';

interface RSVPModalProps {
  open: boolean;
  event: EventDoc | null;
  onClose: () => void;
  onRSVPUpdate: () => void;
  quickEnabled?: boolean; // Control whether to show Quick RSVP section
}

// Animation variants
const modalVariants = {
  hidden: { 
    opacity: 0,
    scale: 0.8,
    y: 50
  },
  visible: { 
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      damping: 25,
      stiffness: 300,
      duration: 0.3
    }
  },
  exit: { 
    opacity: 0,
    scale: 0.8,
    y: 50,
    transition: {
      duration: 0.2
    }
  }
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

export const RSVPModal: React.FC<RSVPModalProps> = ({ open, event, onClose, onRSVPUpdate, quickEnabled = true }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  
  const [status, setStatus] = useState<RSVPStatus>('going');
  const [adults, setAdults] = useState(1);
  const [childCounts, setChildCounts] = useState<ChildCount[]>([
    { ageGroup: '0-2', count: 0 },
    { ageGroup: '3-5', count: 0 },
    { ageGroup: '6-10', count: 0 },
    { ageGroup: '11+', count: 0 }
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingRSVP, setExistingRSVP] = useState<RSVPDoc | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [guests, setGuests] = useState<GuestInfo[]>([]);
  const [showGuestSection, setShowGuestSection] = useState(false);

  // If quickEnabled is false, immediately show details
  useEffect(() => {
    if (!quickEnabled) {
      setShowDetails(true);
    }
  }, [quickEnabled]);

  // Check if user is blocked from RSVP
  const isBlockedFromRSVP = blockedUsers.some(block => 
    block.blockCategory === 'rsvp_only' && block.isActive
  );

  // Load existing RSVP when modal opens
  useEffect(() => {
    if (open && event && currentUser) {
      loadExistingRSVP();
    }
  }, [open, event, currentUser]);

  const loadExistingRSVP = async () => {
    if (!currentUser || !event?.id) return;
    
    try {
      const rsvpRef = doc(db, 'events', event.id, 'rsvps', currentUser.id);
      const snap = await getDoc(rsvpRef);
      
      if (snap.exists()) {
        const data = snap.data();
        setStatus(data.status || 'going');
        setAdults(data.adults || 1);
        // Load child counts from existing RSVP or reset to defaults
        if (data.childCounts && Array.isArray(data.childCounts)) {
          setChildCounts(data.childCounts);
        } else {
          setChildCounts([
            { ageGroup: '0-2', count: 0 },
            { ageGroup: '3-5', count: 0 },
            { ageGroup: '6-10', count: 0 },
            { ageGroup: '11+', count: 0 }
          ]);
        }
        setNotes(data.notes || '');
        setExistingRSVP({ id: snap.id, ...data } as RSVPDoc);
      } else {
        // Reset to defaults for new RSVP
        setStatus('going');
        setAdults(1);
        setChildCounts([
          { ageGroup: '0-2', count: 0 },
          { ageGroup: '3-5', count: 0 },
          { ageGroup: '6-10', count: 0 },
          { ageGroup: '11+', count: 0 }
        ]);
        setNotes('');
        setExistingRSVP(null);
      }
    } catch (error) {
      console.error('Failed to load existing RSVP:', error);
    }
  };

  const handleSubmit = async () => {
    if (!currentUser || !event?.id) return;
    
    setLoading(true);
    try {
      const rsvpRef = doc(db, 'events', event.id, 'rsvps', currentUser.id);
      const snap = await getDoc(rsvpRef);
      
      const rsvpData: Omit<RSVPDoc, 'id'> = {
        eventId: event.id,
        userId: currentUser.id,
        displayName: currentUser.displayName || null,
        email: currentUser.email || null,
        status,
        adults,
        childCounts,
        guests: guests.length > 0 ? guests : undefined,
        notes: notes.trim() || undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (snap.exists()) {
        // Update existing RSVP
        const existing = snap.data();
        const newHistory = [
          ...(existing.statusHistory || []),
          {
            status,
            changedAt: new Date(),
            changedBy: currentUser.id,
          }
        ];
        
        await updateDoc(rsvpRef, {
          ...rsvpData,
          statusHistory: newHistory,
        });
      } else {
        // Create new RSVP
        await setDoc(rsvpRef, {
          ...rsvpData,
          statusHistory: [{
            status,
            changedAt: new Date(),
            changedBy: currentUser.id,
          }],
        });
      }

      toast.success(`RSVP updated: ${status === 'going' ? 'Going' : "Can't Go"}`);
      onRSVPUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to submit RSVP:', error);
      toast.error('Failed to submit RSVP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRSVP = async (quickStatus: RSVPStatus) => {
    setStatus(quickStatus);
    // Use default values: 1 adult, 0 kids, no notes
    setAdults(1);
    setChildCounts([
      { ageGroup: '0-2', count: 0 },
      { ageGroup: '3-5', count: 0 },
      { ageGroup: '6-10', count: 0 },
      { ageGroup: '11+', count: 0 }
    ]);
    setNotes('');
    
    // Submit immediately
    await handleSubmit();
  };



  const totalAttendees = adults + childCounts.reduce((total, child) => total + child.count, 0);
  const isCapacityExceeded = event.maxAttendees ? totalAttendees > event.maxAttendees : false;

  // Format event date and calculate duration
  const eventDate = event.startAt ? new Date(event.startAt.seconds * 1000) : new Date();
  const eventEndDate = event.endAt ? new Date(event.endAt.seconds * 1000) : null;
  
  const formattedDate = format(eventDate, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(eventDate, 'h:mm a');
  
  // Calculate and format duration
  const formatDuration = () => {
    if (!eventEndDate) return null;
    
    const diffMs = eventEndDate.getTime() - eventDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      if (remainingHours > 0) {
        return `(${diffDays} day${diffDays > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''})`;
      } else {
        return `(${diffDays} day${diffDays > 1 ? 's' : ''})`;
      }
    } else if (diffHours > 0) {
      return `(${diffHours} hour${diffHours > 1 ? 's' : ''})`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `(${diffMinutes} minute${diffMinutes > 1 ? 's' : ''})`;
    }
  };
  
  const durationText = formatDuration();
  
  // Generate guest forms based on total attendees (adults + children)
  const generateGuestForms = () => {
    const totalAttendees = adults + childCounts.reduce((total, child) => total + child.count, 0);
    const newGuests: GuestInfo[] = [];
    
    // Add forms for additional adults (excluding the current user)
    if (adults > 1) {
      for (let i = 1; i < adults; i++) {
        newGuests.push({
          name: '',
          phone: '',
          email: '',
          ageGroup: '11+' // Adults are 11+ age group
        });
      }
    }
    
    // Add forms for all children
    childCounts.forEach(child => {
      for (let i = 0; i < child.count; i++) {
        newGuests.push({
          name: '',
          phone: '',
          email: '',
          ageGroup: child.ageGroup
        });
      }
    });
    
    setGuests(newGuests);
    setShowGuestSection(totalAttendees > 1); // Show section if more than 1 attendee
  };
  
  // Update guests when adult or child counts change
  useEffect(() => {
    generateGuestForms();
  }, [adults, childCounts]);

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          
                     {/* Modal */}
           <motion.div
             className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
             variants={modalVariants}
             initial="hidden"
             animate="visible"
             exit="exit"
           >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">RSVP for Event</h2>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </div>
              
              {/* Event Info */}
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">{event.title}</h3>
                <div className="flex items-center gap-4 text-purple-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formattedDate}</span>
                  </div>
                                     <div className="flex items-center gap-2">
                     <Clock className="w-4 h-4" />
                     <span>{formattedTime}</span>
                     {eventEndDate && (
                       <span className="text-purple-200">
                         - {format(eventEndDate, 'h:mm a')}
                       </span>
                     )}
                     {durationText && <span className="text-purple-200">{durationText}</span>}
                   </div>
                  {event.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Blocking Warning */}
            <AnimatePresence>
              {isBlockedFromRSVP && (
                <motion.div
                  className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-xl"
                  initial={{ opacity: 0, height: 0, scale: 0.9 }}
                  animate={{ opacity: 1, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center gap-3 text-red-700">
                    <AlertTriangle className="w-5 h-5" />
                    <div>
                      <p className="font-semibold">RSVP Access Blocked</p>
                      <p className="text-sm">You are currently blocked from RSVP functionality. Please contact an administrator if you believe this is an error.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick RSVP Section */}
            {!isBlockedFromRSVP && !existingRSVP && quickEnabled && (
              <motion.div
                className="p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                  Quick RSVP
                </h4>
                <div className="flex gap-4 justify-center">
                  {(['going', 'not-going'] as const).map((statusOption) => (
                    <motion.button
                      key={statusOption}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleQuickRSVP(statusOption)}
                      disabled={loading}
                      className={`flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 transition-all duration-200 ${
                        statusOption === 'going'
                          ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-400 hover:shadow-lg'
                          : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400 hover:shadow-lg'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {statusOption === 'going' ? (
                        <CheckCircle className="w-8 h-8" />
                      ) : (
                        <XCircle className="w-8 h-8" />
                      )}
                      <span className="font-semibold text-lg capitalize">
                        {statusOption === 'not-going' ? "Can't Go" : statusOption}
                      </span>
                                                                                           <span className="text-sm opacity-75">
                          {statusOption === 'going' ? 'Just you (1 adult)' : 'Simple decline'}
                        </span>
                    </motion.button>
                  ))}
                </div>
                
                <div className="text-center mt-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowDetails(true)}
                    className="text-purple-600 hover:text-purple-700 font-medium underline"
                  >
                    Need to customize? Click here for detailed options
                  </motion.button>
                </div>
              </motion.div>
            )}

                         {/* Detailed RSVP Form */}
             {((showDetails || existingRSVP || !quickEnabled) && !isBlockedFromRSVP) && (
               <motion.div
                 className="flex-1 overflow-y-auto p-4 border-t border-gray-100"
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.3 }}
               >
                <h4 className="text-lg font-semibold text-gray-900 mb-6">
                  {existingRSVP ? 'Update RSVP' : 'Detailed RSVP Options'}
                </h4>
                
                                 <div className="space-y-4">
                  {/* Status Selection */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-gray-700">RSVP Status</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['going', 'not-going'] as const).map((statusOption) => (
                        <motion.button
                          key={statusOption}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setStatus(statusOption)}
                          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                            status === statusOption
                              ? statusOption === 'going'
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-red-500 bg-red-50 text-red-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {statusOption === 'going' ? (
                            <CheckCircle className="w-5 h-5" />
                          ) : (
                            <XCircle className="w-5 h-5" />
                          )}
                          <span className="font-medium capitalize">
                            {statusOption === 'not-going' ? "Can't Go" : statusOption}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Attendee Counts - Only show when going */}
                  {status === 'going' && (
                    <motion.div
                      className="space-y-4"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Users className="w-4 h-4 text-blue-500" />
                            Adults
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={adults}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              setAdults(Math.max(1, Math.min(10, value)));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                          />
                        </div>
                        
                                                 <div className="space-y-2">
                           <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                             <Baby className="w-4 h-4 text-pink-500" />
                             Children by Age Group
                           </label>
                           <div className="space-y-2">
                             {childCounts.map((child, index) => (
                               <div key={child.ageGroup} className="flex items-center gap-3">
                                                                   <span className="text-sm text-gray-600 font-medium w-20">
                                    {child.ageGroup === '0-2' ? '0 - 2 Years' :
                                     child.ageGroup === '3-5' ? '3 - 5 Years' :
                                     child.ageGroup === '6-10' ? '6 - 10 Years' :
                                     '11+ Years'}
                                  </span>
                                 <input
                                   type="number"
                                   min="0"
                                   max="10"
                                   value={child.count}
                                   onChange={(e) => {
                                     const value = Number(e.target.value);
                                     const newCounts = [...childCounts];
                                     newCounts[index].count = Math.max(0, Math.min(10, value));
                                     setChildCounts(newCounts);
                                   }}
                                   className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                                 />
                               </div>
                             ))}
                           </div>
                         </div>
                      </div>

                      {/* Capacity Warning */}
                      <AnimatePresence>
                        {isCapacityExceeded && (
                          <motion.div
                            className="p-3 bg-red-50 border border-red-200 rounded-lg"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                          >
                            <p className="text-sm text-red-700">
                              ⚠️ Total attendees ({totalAttendees}) exceeds event capacity ({event.maxAttendees})
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Total Summary */}
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-700">
                          Total attendees: <span className="font-medium">{totalAttendees}</span>
                          {event.maxAttendees && (
                            <span> / {event.maxAttendees} max</span>
                          )}
                        </p>
                      </div>
                    </motion.div>
                  )}

                                     {/* Notes */}
                   <div className="space-y-2">
                     <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                       <FileText className="w-4 h-4 text-gray-500" />
                       Notes (optional)
                     </label>
                     <textarea
                       value={notes}
                       onChange={(e) => setNotes(e.target.value)}
                       placeholder="Any special requirements, dietary restrictions, or additional information..."
                       rows={3}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all duration-200"
                     />
                   </div>
                   
                                       {/* Guest Information Section */}
                    {showGuestSection && (
                      <motion.div
                        className="space-y-4"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="border-t border-gray-200 pt-4">
                          <h5 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-500" />
                            Guest Information
                          </h5>
                          
                          {/* All Guests Table - Including Primary Attendee */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border border-gray-200">Guest</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border border-gray-200">Name *</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border border-gray-200">Phone</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border border-gray-200">Email</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Primary Attendee Row - Highlighted in Green */}
                                <motion.tr
                                  className="bg-green-50 hover:bg-green-100 transition-colors"
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.05 }}
                                >
                                  <td className="px-3 py-2 border border-green-300">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-green-700">You (Primary)</span>
                                      <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full border border-green-200">Adult</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 border border-green-300">
                                    <input
                                      type="text"
                                      value={currentUser.displayName || ''}
                                      disabled
                                      className="w-full px-2 py-1 text-sm border border-green-300 rounded bg-green-100 text-green-800 cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="px-3 py-2 border border-green-300">
                                    <input
                                      type="tel"
                                      value={currentUser.phoneNumber || ''}
                                      disabled
                                      className="w-full px-2 py-1 text-sm border border-green-300 rounded bg-green-100 text-green-800 cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="px-3 py-2 border border-green-300">
                                    <input
                                      type="email"
                                      value={currentUser.email || ''}
                                      disabled
                                      className="w-full px-2 py-1 text-sm border border-green-300 rounded bg-green-100 text-green-800 cursor-not-allowed"
                                    />
                                  </td>
                                </motion.tr>
                                
                                {/* Additional Guests Rows */}
                                {guests.map((guest, index) => (
                                  <motion.tr
                                    key={index}
                                    className="hover:bg-gray-50 transition-colors"
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: (index + 1) * 0.05 }}
                                  >
                                    <td className="px-3 py-2 border border-gray-200">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-600">
                                          {guest.ageGroup === '11+' ? `Adult ${index + 1}` : `Child ${index + 1}`}
                                        </span>
                                        {/* Only show age badges for children, not for adults */}
                                        {guest.ageGroup !== '11+' && (
                                          <span className={`px-2 py-1 text-xs rounded-full ${
                                            guest.ageGroup === '0-2'
                                              ? 'bg-pink-100 text-pink-700'
                                              : guest.ageGroup === '3-5'
                                              ? 'bg-purple-100 text-purple-700'
                                              : 'bg-orange-100 text-orange-700'
                                          }`}>
                                            {guest.ageGroup === '0-2' ? '0-2' :
                                             guest.ageGroup === '3-5' ? '3-5' :
                                             '6-10'}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 border border-gray-200">
                                      <input
                                        type="text"
                                        value={guest.name}
                                        onChange={(e) => {
                                          const newGuests = [...guests];
                                          newGuests[index].name = e.target.value;
                                          setGuests(newGuests);
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="Guest name"
                                        required
                                        minLength={2}
                                        maxLength={50}
                                        pattern="[A-Za-z\s]+"
                                        title="Name must be 2-50 characters, letters and spaces only"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border border-gray-200">
                                      <input
                                        type="tel"
                                        value={guest.phone}
                                        onChange={(e) => {
                                          const newGuests = [...guests];
                                          newGuests[index].phone = e.target.value;
                                          setGuests(newGuests);
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="(555) 123-4567 or 555-123-4567"
                                        title="Enter phone number in any US format"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border border-gray-200">
                                      <input
                                        type="email"
                                        value={guest.email}
                                        onChange={(e) => {
                                          const newGuests = [...guests];
                                          newGuests[index].email = e.target.value;
                                          setGuests(newGuests);
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="Email"
                                        pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                                        title="Please enter a valid email address"
                                      />
                                    </td>
                                  </motion.tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </motion.div>
                    )}
                </div>
              </motion.div>
            )}

            {/* Footer Actions */}
            {!isBlockedFromRSVP && (showDetails || existingRSVP || !quickEnabled) && (
              <motion.div
                className="p-6 border-t border-gray-100 bg-gray-50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={loading || (status === 'going' && isCapacityExceeded)}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                      loading || (status === 'going' && isCapacityExceeded)
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : status === 'going'
                        ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'
                        : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-lg'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                      </div>
                    ) : (
                      `Submit RSVP`
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );



  // Render above everything else using createPortal
  return ReactDOM.createPortal(modal, document.body);
};
