import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Calendar, Clock, MapPin, Users, FileText, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useStorage } from '../../hooks/useStorage';
import { addDoc, collection, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
  const [isPublic, setIsPublic] = useState(true); // Default to public
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const isEditing = !!eventToEdit;

  const { register, handleSubmit, formState: { errors }, reset } = useForm<EventFormData>({
  resolver: zodResolver(eventSchema),
  defaultValues: isEditing ? {
    title: eventToEdit.title,
    description: eventToEdit.description,
    date: format(tsToDate(eventToEdit.startAt), 'yyyy-MM-dd'),
    time: format(tsToDate(eventToEdit.startAt), 'HH:mm'),
    endTime: eventToEdit.endAt ? format(tsToDate(eventToEdit.endAt), 'HH:mm') : undefined,
    location: eventToEdit.location,
    maxAttendees: eventToEdit.maxAttendees,
    imageUrl: eventToEdit.imageUrl || '',
  } : {},
});

  // Set initial state for editing
  useEffect(() => {
    if (eventToEdit) {
      setTags(eventToEdit.tags || []);
      setIsPublic(eventToEdit.public ?? true);
    }
  }, [eventToEdit]);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };

  const onSubmit = async (data: EventFormData) => {
    if (!currentUser) {
      toast.error('Please sign in to create an event.');
      return;
    }
    // Robust ISO join of date + time
    const startAt = new Date(`${data.date}T${data.time || '00:00'}`);
    if (Number.isNaN(startAt.getTime())) {
      toast.error('Invalid start date or time');
      return;
    }
    const endAt = data.endTime ? new Date(`${data.date}T${data.endTime}`) : undefined;
    if (endAt && Number.isNaN(endAt.getTime())) {
      toast.error('Invalid end time');
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
        location: data.location.trim(),
        imageUrl: imageUrl || (data.imageUrl?.trim() || undefined),
        maxAttendees: data.maxAttendees ? Number(data.maxAttendees) : undefined,
        tags: tags.length > 0 ? tags : undefined,
        createdBy: currentUser.id,
        public: isPublic,
        attendingCount: eventToEdit?.attendingCount ?? 0,
        createdAt: eventToEdit?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (isEditing) {
        // Update existing event
        await updateDoc(doc(db, 'events', eventToEdit.id), eventData);
        
        // Handle teaser updates
        if (!isPublic && !eventToEdit.public) {
          // Event remains private, update teaser
          await setDoc(doc(db, 'event_teasers', eventToEdit.id), {
            title: eventData.title,
            startAt,
            createdAt: serverTimestamp(),
          }, { merge: true });
        } else if (isPublic && eventToEdit.public === false) {
          // Event changed from private to public, remove teaser
          await setDoc(doc(db, 'event_teasers', eventToEdit.id), {}, { merge: true }).catch(() => {});
        }
        
        toast.success('Event updated successfully!');
      } else {
        // Create new event
        const evRef = await addDoc(collection(db, 'events'), eventData);
        // If private & upcoming: create a teaser with the SAME id
        if (!isPublic) {
          await setDoc(doc(db, 'event_teasers', evRef.id), {
            title: eventData.title,
            startAt,
            createdAt: serverTimestamp(),
          }, { merge: true });
        }
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
          {/* Public toggle */}
          <label className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">
              Make this event public (visible to everyone)
            </span>
          </label>
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