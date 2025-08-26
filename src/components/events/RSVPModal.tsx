import React, { useState, useEffect } from 'react';
import { X, Users, Baby, FileText, CheckCircle, XCircle, AlertTriangle, Calendar, MapPin, Clock, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RSVPStatus, RSVPDoc } from '../../types/rsvp';
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
      type: "spring",
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

export const RSVPModal: React.FC<RSVPModalProps> = ({ open, event, onClose, onRSVPUpdate }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  
  const [status, setStatus] = useState<RSVPStatus>('going');
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingRSVP, setExistingRSVP] = useState<RSVPDoc | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
        setKids(data.kids || 0);
        setNotes(data.notes || '');
        setExistingRSVP({ id: snap.id, ...data } as RSVPDoc);
      } else {
        // Reset to defaults for new RSVP
        setStatus('going');
        setAdults(1);
        setKids(0);
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
        kids,
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
    setKids(0);
    setNotes('');
    
    // Submit immediately
    await handleSubmit();
  };

  if (!open || !event || !currentUser) return null;

  const totalAttendees = adults + kids;
  const isCapacityExceeded = event.maxAttendees ? totalAttendees > event.maxAttendees : false;

  // Format event date
  const eventDate = event.startAt ? new Date(event.startAt.seconds * 1000) : new Date();
  const formattedDate = format(eventDate, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(eventDate, 'h:mm a');

  return (
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
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
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
            {!isBlockedFromRSVP && !existingRSVP && (
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
                        {statusOption === 'going' ? '1 adult, no kids' : 'Simple decline'}
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
            {((showDetails || existingRSVP) && !isBlockedFromRSVP) && (
              <motion.div
                className="p-6 border-t border-gray-100"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h4 className="text-lg font-semibold text-gray-900 mb-6">
                  {existingRSVP ? 'Update RSVP' : 'Detailed RSVP Options'}
                </h4>
                
                <div className="space-y-6">
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
                            Kids
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={kids}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              setKids(Math.max(0, Math.min(10, value)));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                          />
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
                </div>
              </motion.div>
            )}

            {/* Footer Actions */}
            {!isBlockedFromRSVP && (showDetails || existingRSVP) && (
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
};
