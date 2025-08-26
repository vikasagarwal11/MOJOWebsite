import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Calendar, Clock, MapPin, Users, FileText, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useStorage } from '../../hooks/useStorage';
import { addDoc, collection, doc, updateDoc, serverTimestamp, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// Firestore shouldn't see undefined fields
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// Helper function to convert timestamp to Date
function tsToDate(v: any): Date {
  if (!v) return new Date();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  return new Date(v);
}

const eventSchema = z.object({
  title: z.string().min(1, 'Event title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  date: z.string().min(1, 'Event date is required'),
  time: z.string().min(1, 'Event time is required'),
  endTime: z.string().optional(),
  endDate: z.string().optional(),
  isAllDay: z.boolean().optional(),
  location: z.string().min(1, 'Location is required'),
  maxAttendees: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type EventFormData = z.infer<typeof eventSchema>;

interface CreateEventModalProps {
  onClose: () => void;
  onEventCreated: () => void;
  eventToEdit?: any; // New prop for editing
}

const CreateEventModal: React.FC<CreateEventModalProps> = ({ onClose, onEventCreated, eventToEdit }) => {
  const { currentUser } = useAuth();
  const { uploadFile, getStoragePath } = useStorage();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [eventVisibility, setEventVisibility] = useState<'public' | 'members' | 'private'>('members'); // Default to members-only
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [invitedUserDetails, setInvitedUserDetails] = useState<{[key: string]: any}>({});
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const isEditing = !!eventToEdit;

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<EventFormData>({
  resolver: zodResolver(eventSchema),
  defaultValues: isEditing ? {
    title: eventToEdit.title,
    description: eventToEdit.description,
    date: format(tsToDate(eventToEdit.startAt), 'yyyy-MM-dd'),
    time: format(tsToDate(eventToEdit.startAt), 'HH:mm'),
    endTime: eventToEdit.endAt ? format(tsToDate(eventToEdit.endAt), 'HH:mm') : undefined,
    endDate: eventToEdit.endAt ? format(tsToDate(eventToEdit.endAt), 'yyyy-MM-dd') : undefined,
    isAllDay: false, // Default to false for existing events
    location: eventToEdit.location,
    maxAttendees: eventToEdit.maxAttendees,
    imageUrl: eventToEdit.imageUrl || '',
  } : {
    isAllDay: false, // Default to false for new events
  },
});

  // Set initial state for editing
  useEffect(() => {
    if (eventToEdit) {
      setTags(eventToEdit.tags || []);
      // Convert old 'public' field to new 'visibility' system
      if (eventToEdit.visibility) {
        setEventVisibility(eventToEdit.visibility);
      } else if (eventToEdit.public !== undefined) {
        setEventVisibility(eventToEdit.public ? 'public' : 'members');
      }
      setInvitedUsers(eventToEdit.invitedUsers || []);
      
      // Load invited user details if editing a private event
      if (eventToEdit.invitedUsers && eventToEdit.invitedUsers.length > 0) {
        // This would ideally fetch user details from Firestore
        // For now, we'll set placeholder data
        const placeholderDetails: {[key: string]: any} = {};
        eventToEdit.invitedUsers.forEach((userId: string) => {
          placeholderDetails[userId] = {
            id: userId,
            displayName: `User ${userId.slice(0, 8)}...`,
            email: 'Loading...',
            photoURL: null
          };
        });
        setInvitedUserDetails(placeholderDetails);
      }
    }
  }, [eventToEdit]);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };

  // Search users for invitation
  const handleUserSearch = async () => {
    if (!userSearchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // Search users by displayName or email
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('displayName', '>=', userSearchQuery),
        where('displayName', '<=', userSearchQuery + '\uf8ff'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        displayName: doc.data().displayName || 'Unknown User',
        email: doc.data().email || 'No email',
        photoURL: doc.data().photoURL
      }));
      
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search users:', error);
      toast.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  // Add user to invitation list
  const handleInviteUser = (user: any) => {
    if (!invitedUsers.includes(user.id)) {
      setInvitedUsers([...invitedUsers, user.id]);
      setInvitedUserDetails(prev => ({
        ...prev,
        [user.id]: user
      }));
      setSearchResults([]);
      setUserSearchQuery('');
      toast.success(`Invited ${user.displayName}`);
    }
  };

  // Remove user from invitation list
  const handleRemoveInvitedUser = (userId: string) => {
    setInvitedUsers(invitedUsers.filter(id => id !== userId));
    setInvitedUserDetails(prev => {
      const newDetails = { ...prev };
      delete newDetails[userId];
      return newDetails;
    });
  };

  const onSubmit = async (data: EventFormData) => {
    if (!currentUser) {
      toast.error('Please sign in to create an event.');
      return;
    }
    // Handle all-day vs timed events
    let startAt: Date;
    let endAt: Date | undefined;
    
    if (data.isAllDay) {
      // All-day event: start at midnight of start date
      startAt = new Date(`${data.date}T00:00:00`);
      
      // For all-day events, end date is required
      if (data.endDate) {
        // Multi-day all-day event: end at midnight of end date (exclusive)
        endAt = new Date(`${data.endDate}T00:00:00`);
        endAt.setDate(endAt.getDate() + 1); // Make it exclusive
      } else {
        // Single-day all-day event: end at midnight of next day
        endAt = new Date(startAt.getTime());
        endAt.setDate(endAt.getDate() + 1);
      }
    } else {
      // Timed event: use start time
      startAt = new Date(`${data.date}T${data.time || '00:00'}`);
      
      // Handle end time with optional end date for multi-day events
      if (data.endTime) {
        const endDateStr = data.endDate || data.date; // default to same day if no end date
        endAt = new Date(`${endDateStr}T${data.endTime}`);
        
        // Validate end date/time
        if (Number.isNaN(endAt.getTime())) {
          toast.error('Invalid end date or time');
          return;
        }
        
        // If no end date specified and end time <= start time, assume next day
        if (!data.endDate && endAt <= startAt) {
          endAt = new Date(endAt.getTime());
          endAt.setDate(endAt.getDate() + 1);
        }
      }
    }
    
    if (Number.isNaN(startAt.getTime())) {
      toast.error('Invalid start date or time');
      return;
    }
    if (endAt && Number.isNaN(endAt.getTime())) {
      toast.error('Invalid end time or date');
      return;
    }
    if (endAt && endAt <= startAt) {
      toast.error('End time must be after start time');
      return;
    }
    setIsLoading(true);
    try {
      // Optional image upload
      let imageUrl = eventToEdit?.imageUrl || '';
      if (selectedFile) {
        const imagePath = getStoragePath('events', selectedFile.name);
        imageUrl = await uploadFile(selectedFile, imagePath);
      }
      // Build event payload (no undefineds)
      const eventData = stripUndefined({
        title: data.title.trim(),
        titleLower: data.title.trim().toLowerCase(), // For EventTypeahead search
        description: data.description.trim(),
        startAt,
        endAt,
        allDay: data.isAllDay, // Add all-day flag
        location: data.location.trim(),
        imageUrl: imageUrl || (data.imageUrl?.trim() || undefined),
        maxAttendees: data.maxAttendees ? Number(data.maxAttendees) : undefined,
        tags: tags.length > 0 ? tags : undefined,
        createdBy: currentUser.id,
        visibility: eventVisibility,
        invitedUsers: eventVisibility === 'private' ? invitedUsers : undefined,
        attendingCount: eventToEdit?.attendingCount ?? 0,
        createdAt: eventToEdit?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (isEditing) {
        // Update existing event
        await updateDoc(doc(db, 'events', eventToEdit.id), eventData);
        
        // Note: Cloud Functions handle event_teasers collection management
        // No need to manually manage teasers here
        
        toast.success('Event updated successfully!');
      } else {
        // Create new event
        const evRef = await addDoc(collection(db, 'events'), eventData);
        // Note: Cloud Functions handle event_teasers collection management
        // No need to manually create teasers here
        toast.success('Event created successfully!');
      }
      
      reset();
      setSelectedFile(null);
      setTags([]);
      setTagInput('');
      onEventCreated();
    } catch (e: any) {
      console.error('Error saving event:', e);
      toast.error(e?.message || `Failed to ${isEditing ? 'update' : 'create'} event`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">{isEditing ? 'Edit Event' : 'Create New Event'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Event Title</label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('title')}
                type="text"
                disabled={isLoading}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.title ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                placeholder="Enter event title"
              />
            </div>
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              {...register('description')}
              rows={4}
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-lg border ${errors.description ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
              placeholder="Describe your event..."
            />
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  {...register('date')}
                  type="date"
                  disabled={isLoading}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.date ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                />
              </div>
              {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  {...register('time')}
                  type="time"
                  disabled={isLoading}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.time ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                />
              </div>
              {errors.time && <p className="mt-1 text-sm text-red-600">{errors.time.message}</p>}
            </div>
          </div>
          
          {/* All Day Event Option */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-700">Event Type</h3>
            </div>
            <div className="flex items-center gap-3">
              <input
                {...register('isAllDay')}
                type="checkbox"
                id="isAllDay"
                disabled={isLoading}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="isAllDay" className="text-sm font-medium text-gray-700">
                All Day Event
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Check this for events that span entire days (like conferences, workshops, or multi-day events)
            </p>
          </div>

          {/* End Time and Date Section - Only show when not all-day */}
          {!watch('isAllDay') && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-700">Event Duration</h3>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Set end time and optionally end date for timed events. Leave end date empty for same-day events.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time (Optional)</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      {...register('endTime')}
                      type="time"
                      disabled={isLoading}
                      className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.endTime ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                      placeholder="End time"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date (Optional)</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      {...register('endDate')}
                      type="date"
                      disabled={isLoading}
                      className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.endDate ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                      placeholder="End date"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Leave empty for same-day events</p>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('location')}
                type="text"
                disabled={isLoading}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.location ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                placeholder="Enter event location"
              />
            </div>
            {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tags (Optional)</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); setTagInput(''); } }}
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Add tags (e.g., yoga, running)"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map(t => (
                <span key={t} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                  {t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))} className="ml-2">x</button>
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Attendees (Optional)</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  {...register('maxAttendees')}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="No limit"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Event Image (Optional)</label>
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  disabled={isLoading}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <div className="text-center text-gray-500">or</div>
                <input
                  {...register('imageUrl')}
                  type="url"
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter image URL..."
                />
              </div>
            </div>
          </div>
          {/* Event Visibility Selection */}
          <div className="space-y-4 pt-4">
            <label className="block text-sm font-medium text-gray-700">Event Visibility</label>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={eventVisibility === 'public'}
                  onChange={(e) => setEventVisibility(e.target.value as 'public' | 'members' | 'private')}
                  disabled={isLoading}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">🌍 Public Event</span>
                  <p className="text-xs text-gray-500">Visible to everyone, anyone can RSVP</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="visibility"
                  value="members"
                  checked={eventVisibility === 'members'}
                  onChange={(e) => setEventVisibility(e.target.value as 'public' | 'members' | 'private')}
                  disabled={isLoading}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">👥 Members Only</span>
                  <p className="text-xs text-gray-500">Visible to platform members only</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={eventVisibility === 'private'}
                  onChange={(e) => setEventVisibility(e.target.value as 'public' | 'members' | 'private')}
                  disabled={isLoading}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">🔒 Private Event</span>
                  <p className="text-xs text-gray-500">Invitation only, select specific users</p>
                </div>
              </label>
            </div>
          </div>

          {/* Invitation System for Private Events */}
          {eventVisibility === 'private' && (
            <div className="space-y-4 pt-4">
              <label className="block text-sm font-medium text-gray-700">Invite Users</label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search users by name or email..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleUserSearch}
                    disabled={isLoading || !userSearchQuery.trim() || isSearching}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
                
                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Search Results:</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {searchResults.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-3">
                            {user.photoURL && (
                              <img 
                                src={user.photoURL} 
                                alt={user.displayName}
                                className="w-8 h-8 rounded-full"
                              />
                            )}
                            <div>
                              <div className="font-medium text-sm text-gray-700">{user.displayName}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleInviteUser(user)}
                            disabled={invitedUsers.includes(user.id)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              invitedUsers.includes(user.id)
                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                            title={invitedUsers.includes(user.id) ? 'Already invited' : 'Invite user'}
                          >
                            {invitedUsers.includes(user.id) ? 'Invited' : 'Invite'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Invited Users List */}
                {invitedUsers.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Invited Users ({invitedUsers.length}):
                    </label>
                    <div className="space-y-2">
                      {invitedUsers.map((userId, index) => {
                        const userDetails = invitedUserDetails[userId] || 
                                          { id: userId, displayName: 'Loading...', email: 'Loading...' };
                        
                        return (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center gap-3">
                              {userDetails.photoURL && (
                                <img 
                                  src={userDetails.photoURL} 
                                  alt={userDetails.displayName}
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                              <div>
                                <div className="font-medium text-sm text-gray-700">{userDetails.displayName}</div>
                                <div className="text-xs text-gray-500">{userDetails.email}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveInvitedUser(userId)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                              title="Remove invitation"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Submit */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
            >
              {isLoading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Event' : 'Create Event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventModal;