import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Calendar, Clock, MapPin, Users, FileText, Tag, QrCode, DollarSign, Search, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useStorage } from '../../hooks/useStorage';
import { addDoc, collection, doc, updateDoc, serverTimestamp, query, where, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { safeFormat, safeISODate } from '../../utils/dateUtils';
import { PaymentService } from '../../services/paymentService';
import { EventPricing } from '../../types/payment';

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
  description: z.string().min(200, 'Description must be at least 200 characters to ensure proper display'),
  date: z.string().min(1, 'Event date is required'),
  time: z.string().min(1, 'Event time is required'),
  endTime: z.string().optional(),
  endDate: z.string().optional(),
  isAllDay: z.boolean().optional(),
  duration: z.string().optional(), // Duration in hours
  location: z.string().optional(), // Optional for backward compatibility
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  maxAttendees: z.string().optional(),
  waitlistEnabled: z.boolean().optional(),
  waitlistLimit: z.string().optional(),
  waitlistCount: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  attendanceEnabled: z.boolean().optional(),
  // Payment fields
  requiresPayment: z.boolean().optional(),
  adultPrice: z.string().optional(),
  childPrice: z.string().optional(),
  teenPrice: z.string().optional(),
  infantPrice: z.string().optional(),
  currency: z.string().optional(),
  refundAllowed: z.boolean().optional(),
  refundDeadline: z.string().optional(),
  isReadOnly: z.boolean().optional(),
}).refine((data) => {
  // Custom validation for timed events
  if (!data.isAllDay) {
    if (!data.endTime || !data.endDate) {
      return false;
    }
    
    // Check if end time is after start time
    const startDateTime = new Date(`${data.date}T${data.time}`);
    const endDateTime = new Date(`${data.endDate}T${data.endTime}`);
    
    return endDateTime > startDateTime;
  }
  return true;
}, {
  message: "For timed events, end date and time are required and must be after start time",
  path: ["endTime"]
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
  const [eventVisibility, setEventVisibility] = useState<'public' | 'members' | 'private'>('public'); // Default to public
  const [invitedUserIds, setInvitedUserIds] = useState<string[]>([]);
  const [invitedUserDetails, setInvitedUserDetails] = useState<{[key: string]: any}>({});
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imageRemoved, setImageRemoved] = useState(false); // Track if image was removed
  const [isManuallyOverridden, setIsManuallyOverridden] = useState(false); // Track if end date/time are manually overridden
  // Payment state
  const [requiresPayment, setRequiresPayment] = useState(false);
  
  // Waitlist state
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState('0');
  
  // Read-only state
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  // Address autocomplete state
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isVenueResolving, setIsVenueResolving] = useState(false);
  
  // Venue name autocomplete state
  const [venueSuggestions, setVenueSuggestions] = useState<any[]>([]);
  const [isVenueLoading, setIsVenueLoading] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  
  const addressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addressAbortControllerRef = useRef<AbortController | null>(null);

  const isEditing = !!eventToEdit;

  const handleClose = () => {
    reset();
    setSelectedFile(null);
    setTags([]);
    setTagInput('');
    setImageRemoved(false);
    setInvitedUserIds([]);
    setInvitedUserDetails({});
    setUserSearchQuery('');
    setSearchResults([]);
    setEventVisibility('public');
    
    // Cleanup address autocomplete
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setIsVenueResolving(false);
    
    // Cleanup venue suggestions
    setVenueSuggestions([]);
    setShowVenueSuggestions(false);
    
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }
    if (addressAbortControllerRef.current) {
      addressAbortControllerRef.current.abort();
    }
    
    onClose();
  };

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue, getValues } = useForm<EventFormData>({
  resolver: zodResolver(eventSchema),
  defaultValues: isEditing ? {
    title: eventToEdit.title,
    description: eventToEdit.description,
    date: safeFormat(tsToDate(eventToEdit.startAt), 'yyyy-MM-dd'),
    time: safeFormat(tsToDate(eventToEdit.startAt), 'HH:mm'),
    endTime: eventToEdit.endAt ? safeFormat(tsToDate(eventToEdit.endAt), 'HH:mm') : undefined,
    endDate: eventToEdit.endAt ? safeFormat(tsToDate(eventToEdit.endAt), 'yyyy-MM-dd') : undefined,
    isAllDay: false, // Default to false for existing events
    location: eventToEdit.location,
    maxAttendees: eventToEdit.maxAttendees,
    waitlistEnabled: eventToEdit.waitlistEnabled || false,
    waitlistLimit: eventToEdit.waitlistLimit?.toString() || '',
    waitlistCount: eventToEdit.waitlistCount?.toString() || '0',
    imageUrl: eventToEdit.imageUrl || '',
    attendanceEnabled: eventToEdit.attendanceEnabled || false,
    // Payment fields
    requiresPayment: eventToEdit.pricing?.requiresPayment || false,
    adultPrice: eventToEdit.pricing?.adultPrice ? (eventToEdit.pricing.adultPrice / 100).toString() : '',
    currency: eventToEdit.pricing?.currency || 'USD',
    refundAllowed: eventToEdit.pricing?.refundPolicy?.allowed === true,
  } : {
    isAllDay: false, // Default to false for new events
    duration: '1', // Default 1 hour duration
    attendanceEnabled: false, // Default to false for new events
    requiresPayment: false, // Default to free events
    currency: 'USD', // Default currency
    refundAllowed: false, // Default no refunds
  },
});

// Watch form values for smart defaults
const watchedDate = watch('date');
const watchedTime = watch('time');
const watchedEndTime = watch('endTime');
const watchedEndDate = watch('endDate');
const watchedIsAllDay = watch('isAllDay');
const watchedDuration = watch('duration');

// Smart defaults: Set end date to start date when start date changes
useEffect(() => {
  if (watchedDate && !watchedEndDate && !isEditing) {
    setValue('endDate', watchedDate);
  }
}, [watchedDate, watchedEndDate, setValue, isEditing]);

// Smart defaults: Set end time to start time + 1 hour when start time changes
useEffect(() => {
  if (watchedTime && !watchedEndTime && !isEditing) {
    const [hours, minutes] = watchedTime.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(hours + 1, minutes, 0, 0);
    const endTimeString = endTime.toTimeString().slice(0, 5);
    setValue('endTime', endTimeString);
  }
}, [watchedTime, watchedEndTime, setValue, isEditing]);

// Clear end date/time when switching to all-day
useEffect(() => {
  if (watchedIsAllDay) {
    setValue('endTime', '');
    setValue('endDate', '');
    setValue('duration', '');
  }
}, [watchedIsAllDay, setValue]);

// Duration calculation: Auto-calculate end time when duration changes
useEffect(() => {
  if (watchedDuration && watchedDate && watchedTime && !watchedIsAllDay && !isEditing) {
    const durationHours = parseFloat(watchedDuration);
    if (!isNaN(durationHours) && durationHours > 0) {
      const [hours, minutes] = watchedTime.split(':').map(Number);
      const startDateTime = new Date();
      startDateTime.setHours(hours, minutes, 0, 0);
      
      // Add duration
      const endDateTime = new Date(startDateTime.getTime() + (durationHours * 60 * 60 * 1000));
      
      // Format end time
      const endTimeString = endDateTime.toTimeString().slice(0, 5);
      
      // Check if we need to move to next day
      const endDate = new Date(watchedDate);
      if (endDateTime.getHours() < hours || (endDateTime.getHours() === hours && endDateTime.getMinutes() < minutes)) {
        endDate.setDate(endDate.getDate() + 1);
      }
      
      setValue('endTime', endTimeString);
      setValue('endDate', safeISODate(endDate));
    }
  }
}, [watchedDuration, watchedDate, watchedTime, watchedIsAllDay, setValue, isEditing]);

  // Load existing event data for editing
  useEffect(() => {
    if (eventToEdit) {
      // Load form data from existing event
      setValue('title', eventToEdit.title);
      setValue('description', eventToEdit.description);
      setValue('location', eventToEdit.location);
      setValue('venueName', eventToEdit.venueName || '');
      setValue('venueAddress', eventToEdit.venueAddress || '');
      setValue('maxAttendees', eventToEdit.maxAttendees?.toString() || '');
      setValue('waitlistLimit', eventToEdit.waitlistLimit?.toString() || '');
      setValue('waitlistCount', eventToEdit.waitlistCount?.toString() || '0');
      setValue('attendanceEnabled', eventToEdit.attendanceEnabled || false);
      
      // Set read-only state
      setIsReadOnly(eventToEdit.isReadOnly || false);
      
      // Set dates
      if (eventToEdit.startAt) {
        const startDate = eventToEdit.startAt.toDate ? eventToEdit.startAt.toDate() : new Date(eventToEdit.startAt);
        setValue('date', format(startDate, 'yyyy-MM-dd'));
        setValue('time', format(startDate, 'HH:mm'));
        
        if (eventToEdit.endAt) {
          const endDate = eventToEdit.endAt.toDate ? eventToEdit.endAt.toDate() : new Date(eventToEdit.endAt);
          setValue('endTime', format(endDate, 'HH:mm'));
        }
      }
      
      // Set tags
      if (eventToEdit.tags && eventToEdit.tags.length > 0) {
        setTags(eventToEdit.tags);
      }
      
      // Set visibility
      setEventVisibility(eventToEdit.visibility || 'public');
      
      // Set invited users - Updated to use invitedUserIds
      setInvitedUserIds(eventToEdit.invitedUserIds || []);
      
      // Load existing invited users for display
      if (eventToEdit.invitedUserIds && eventToEdit.invitedUserIds.length > 0) {
        // Set invited user IDs for display
        setInvitedUserIds(eventToEdit.invitedUserIds);
      }
      
      // Set image
      if (eventToEdit.imageUrl) {
        setValue('imageUrl', eventToEdit.imageUrl);
      }
      
      // Set payment configuration
      if (eventToEdit.pricing) {
        setValue('requiresPayment', eventToEdit.pricing.requiresPayment || false);
        setValue('adultPrice', eventToEdit.pricing.adultPrice ? (eventToEdit.pricing.adultPrice / 100).toString() : '');
        setValue('currency', eventToEdit.pricing.currency || 'USD');
        setValue('refundAllowed', eventToEdit.pricing.refundPolicy?.allowed === true);
        
        // Set age group pricing
        if (eventToEdit.pricing.ageGroupPricing) {
          const pricing = eventToEdit.pricing.ageGroupPricing;
          const adultPricing = pricing.find((p: any) => p.ageGroup === 'adult');
          const childPricing = pricing.find((p: any) => p.ageGroup === '3-5');
          const teenPricing = pricing.find((p: any) => p.ageGroup === '11+');
          const infantPricing = pricing.find((p: any) => p.ageGroup === '0-2');
          
          setValue('adultPrice', adultPricing ? (adultPricing.price / 100).toString() : '');
          setValue('childPrice', childPricing ? (childPricing.price / 100).toString() : '');
          setValue('teenPrice', teenPricing ? (teenPricing.price / 100).toString() : '');
          setValue('infantPrice', infantPricing ? (infantPricing.price / 100).toString() : '');
        }
        
        // Set refund deadline
        if (eventToEdit.pricing.refundPolicy?.deadline) {
          const deadline = eventToEdit.pricing.refundPolicy.deadline.toDate ? 
            eventToEdit.pricing.refundPolicy.deadline.toDate() : 
            new Date(eventToEdit.pricing.refundPolicy.deadline);
          setValue('refundDeadline', format(deadline, 'yyyy-MM-dd'));
        }
        
        // Update payment state
        setRequiresPayment(eventToEdit.pricing.requiresPayment || false);
      }
      
      // Update waitlist state
      setWaitlistEnabled(eventToEdit.waitlistEnabled || false);
      setWaitlistCount(eventToEdit.waitlistCount?.toString() || '0');
    }
  }, [eventToEdit, setValue]);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };

  // Address autocomplete functions - Using FREE OpenStreetMap Nominatim API
  const searchAddresses = async (query: string) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    // Cancel previous request
    if (addressAbortControllerRef.current) {
      addressAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    addressAbortControllerRef.current = controller;

    setIsAddressLoading(true);

    try {
      // Use FREE OpenStreetMap Nominatim API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=8&addressdetails=1&extratags=1`,
        { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'MomsFitnessMojo/1.0'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAddressSuggestions(data.map((item: any, index: number) => ({
          id: `osm_${index}`,
          description: item.display_name,
          mainText: item.name || item.display_name.split(',')[0],
          secondaryText: item.display_name.split(',').slice(1).join(',').trim(),
          type: 'osm',
          lat: item.lat,
          lon: item.lon,
          category: item.category || 'address'
        })));
        setShowAddressSuggestions(true);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Address search error:', error);
        setAddressSuggestions([]);
      }
    } finally {
      setIsAddressLoading(false);
    }
  };

  const handleAddressInput = (value: string) => {
    setValue('venueAddress', value);
    
    // Clear previous timeout
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    // Set new timeout for debounced search
    addressTimeoutRef.current = setTimeout(() => {
      searchAddresses(value);
    }, 300);
  };

  const selectAddress = (suggestion: any) => {
    const currentVenueName = getValues('venueName');
    const fullAddress = suggestion.description;
    
    // Extract venue name from address (first part before comma)
    const extractedVenueName = suggestion.mainText || fullAddress.split(',')[0].trim();
    
    // Check if venue name is already manually set by user
    const isVenueManuallySet = currentVenueName && currentVenueName.length > 0;
    
    if (isVenueManuallySet) {
      // User has manually set venue name, preserve it and clean the address
      let cleanAddress = fullAddress;
      
      // If the address starts with the venue name, remove it to avoid duplication
      if (cleanAddress.toLowerCase().startsWith(currentVenueName.toLowerCase())) {
        cleanAddress = cleanAddress.substring(currentVenueName.length).trim();
        // Remove leading comma if present
        if (cleanAddress.startsWith(',')) {
          cleanAddress = cleanAddress.substring(1).trim();
        }
      }
      
      setValue('venueAddress', cleanAddress);
    } else {
      // No venue name set, auto-populate both fields
      setValue('venueName', extractedVenueName);
      
      // Strip venue name from address to avoid duplication
      let cleanAddress = fullAddress;
      if (cleanAddress.toLowerCase().startsWith(extractedVenueName.toLowerCase())) {
        cleanAddress = cleanAddress.substring(extractedVenueName.length).trim();
        // Remove leading comma if present
        if (cleanAddress.startsWith(',')) {
          cleanAddress = cleanAddress.substring(1).trim();
        }
      }
      
      setValue('venueAddress', cleanAddress);
    }
    
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
  };

  // Auto-resolve address from venue name
  const resolveVenueAddress = async (venueName: string) => {
    if (!venueName || venueName.length < 3) {
      setIsVenueResolving(false);
      return;
    }

    // Cancel previous request
    if (addressAbortControllerRef.current) {
      addressAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    addressAbortControllerRef.current = controller;

    setIsVenueResolving(true);

    try {
      // Search for the venue name specifically
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(venueName)}&countrycodes=us&limit=1&addressdetails=1&extratags=1&class=amenity`,
        { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'MomsFitnessMojo/1.0'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const venue = data[0];
          const address = venue.display_name;
          setValue('venueAddress', address);
          
          // Show a brief success message
          toast.success(`📍 Address found: ${venue.name || venueName}`);
        } else {
          // No venue found, show helpful message
          toast(`No address found for "${venueName}". Try typing the address manually.`, { icon: 'ℹ️' });
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.log('Venue address resolution failed:', error);
        // Don't show error to user, just silently fail
      }
    } finally {
      setIsVenueResolving(false);
    }
  };

  // Search for venue suggestions
  const searchVenues = async (query: string) => {
    if (!query || query.length < 3) {
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
      return;
    }

    // Cancel previous request
    if (addressAbortControllerRef.current) {
      addressAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    addressAbortControllerRef.current = controller;

    setIsVenueLoading(true);

    try {
      // Search for venues/businesses
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=5&addressdetails=1&extratags=1&class=amenity&type=business`,
        { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'MomsFitnessMojo/1.0'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setVenueSuggestions(data.map((item: any, index: number) => ({
          id: `venue_${index}`,
          name: item.name || item.display_name.split(',')[0],
          address: item.display_name,
          type: item.type || 'venue',
          category: item.category || 'business',
          lat: item.lat,
          lon: item.lon
        })));
        setShowVenueSuggestions(true);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Venue search error:', error);
        setVenueSuggestions([]);
      }
    } finally {
      setIsVenueLoading(false);
    }
  };

  const selectVenue = (venue: any) => {
    setValue('venueName', venue.name);
    setValue('venueAddress', venue.address);
    setShowVenueSuggestions(false);
    setVenueSuggestions([]);
    toast.success(`📍 Venue selected: ${venue.name}`);
  };

  const handleVenueNameInput = (value: string) => {
    setValue('venueName', value);
    
    // Clear previous timeout
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    // Set new timeout for debounced venue search
    addressTimeoutRef.current = setTimeout(() => {
      searchVenues(value);
    }, 300); // 300ms delay for venue search
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
    if (!invitedUserIds.includes(user.id)) {
      setInvitedUserIds([...invitedUserIds, user.id]);
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
    setInvitedUserIds(invitedUserIds.filter(id => id !== userId));
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
    if (currentUser.role !== 'admin') {
      toast.error('Only admins can create events');
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
      // Handle image management
      let imageUrl: string | undefined = undefined;
      
      console.log('🔍 Image Management Debug:', {
        isEditing,
        imageRemoved,
        selectedFile: !!selectedFile,
        dataImageUrl: data.imageUrl,
        eventToEditImageUrl: eventToEdit?.imageUrl,
        currentImageRemoved: imageRemoved
      });
      
      if (isEditing) {
        // When editing, check if image was removed or changed
        if (imageRemoved) {
          // Image was explicitly removed (soft delete) - ALWAYS clear it
          imageUrl = undefined; // This will clear the image
        } else if (selectedFile) {
          // New file uploaded
          const imagePath = getStoragePath('events', selectedFile.name);
          imageUrl = await uploadFile(selectedFile, imagePath);
        } else if (data.imageUrl?.trim()) {
          // URL provided
          imageUrl = data.imageUrl.trim();
        } else if (eventToEdit?.imageUrl && !data.imageUrl?.trim()) {
          // Image was removed by clearing the URL field
          imageUrl = undefined; // This will clear the image
        } else {
          // Keep existing image
          imageUrl = eventToEdit?.imageUrl;
        }
      } else {
        // Creating new event
        if (selectedFile) {
          const imagePath = getStoragePath('events', selectedFile.name);
          imageUrl = await uploadFile(selectedFile, imagePath);
        } else if (data.imageUrl?.trim()) {
          imageUrl = data.imageUrl.trim();
        }
      }
      
      console.log('🔍 Final imageUrl value:', imageUrl);
      
      // Create pricing configuration
      let pricing: EventPricing | undefined;
      if (data.requiresPayment) {
        const adultPrice = data.adultPrice ? Math.round(parseFloat(data.adultPrice) * 100) : 0;
        const childPrice = data.childPrice ? Math.round(parseFloat(data.childPrice) * 100) : 0;
        const teenPrice = data.teenPrice ? Math.round(parseFloat(data.teenPrice) * 100) : 0;
        const infantPrice = data.infantPrice ? Math.round(parseFloat(data.infantPrice) * 100) : 0;
        
        pricing = PaymentService.createPaidEventPricing(adultPrice, {
          '0-2': infantPrice,
          '3-5': childPrice,
          '6-10': childPrice,
          '11+': teenPrice,
          'adult': adultPrice
        }, data.currency || 'USD');
        
        // Add refund policy only if user explicitly allows refunds
        if (data.refundAllowed) {
          pricing.refundPolicy = {
            allowed: true,
            deadline: data.refundDeadline ? Timestamp.fromDate(new Date(data.refundDeadline)) : undefined,
            feePercentage: 5 // Default 5% refund fee
          };
        } else {
          // Explicitly set refund policy to not allowed
          pricing.refundPolicy = {
            allowed: false
          };
        }
      } else {
        pricing = PaymentService.createDefaultPricing();
      }

      // Build event payload (no undefineds)
      const eventData = stripUndefined({
        title: data.title.trim(),
        titleLower: data.title.trim().toLowerCase(), // For EventTypeahead search
        description: data.description.trim(),
        startAt,
        endAt,
        allDay: data.isAllDay, // Add all-day flag
        location: data.location?.trim() || undefined,
        venueName: data.venueName?.trim() || undefined,
        venueAddress: data.venueAddress?.trim() || undefined,
        imageUrl: imageUrl === undefined ? null : imageUrl, // Convert undefined to null for Firestore
        maxAttendees: data.maxAttendees ? Number(data.maxAttendees) : undefined,
        waitlistEnabled: waitlistEnabled,
        waitlistLimit: data.waitlistLimit ? Number(data.waitlistLimit) : undefined,
        waitlistCount: data.waitlistCount ? Number(data.waitlistCount) : undefined,
        attendanceEnabled: data.attendanceEnabled || false,
        tags: tags.length > 0 ? tags : undefined,
        createdBy: currentUser.id,
        visibility: eventVisibility,
        invitedUserIds: eventVisibility === 'private' ? invitedUserIds : undefined,
        attendingCount: eventToEdit?.attendingCount ?? 0,
        pricing: pricing,
        isReadOnly: isReadOnly,
        createdAt: eventToEdit?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
       
      console.log('🔍 Final eventData:', eventData);

      if (isEditing) {
        // Update existing event
        await updateDoc(doc(db, 'events', eventToEdit.id), eventData);
        
        // Note: Cloud Functions handle event_teasers collection management
        // No need to manually manage teasers here
        
        toast.success('Event updated successfully!');
      } else {
        // Create new event
        await addDoc(collection(db, 'events'), eventData);
        // Note: Cloud Functions handle event_teasers collection management
        // No need to manually create teasers here
        toast.success('Event created successfully!');
      }
      
      handleClose(); // Use the centralized close function
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
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white">
          <h2 className="text-2xl font-bold text-white">{isEditing ? 'Edit Event' : 'Create New Event'}</h2>
          <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6 text-white" />
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
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.title ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent`}
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
              className={`w-full px-4 py-3 rounded-lg border ${errors.description ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent`}
              placeholder="Describe your event..."
            />
            <div className="flex justify-between items-center mt-1">
              <div className="text-xs text-gray-500">
                {watch('description')?.length || 0} / 200 characters minimum
              </div>
              {watch('description') && watch('description').length >= 200 && (
                <div className="text-xs text-green-600 font-medium">✓ Ready for display</div>
              )}
            </div>
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
          </div>
          {/* Event Start, Type & Duration - All in One Compact Row */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#F25129]" />
              <h3 className="text-sm font-medium text-gray-700">Event Details</h3>
            </div>
            
            {/* Two-Row Layout: Start/End aligned, All Day/Duration on right */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              {/* Row 1: Start Date & Time */}
              <div className="lg:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    {...register('date')}
                    type="date"
                    disabled={isLoading}
                    className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border ${errors.date ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                  />
                </div>
                {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
              </div>
              
              <div className="lg:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
                <div className="relative">
                  <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    {...register('time')}
                    type="time"
                    disabled={isLoading}
                    className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border ${errors.time ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                  />
                </div>
                {errors.time && <p className="mt-1 text-xs text-red-600">{errors.time.message}</p>}
              </div>
              
              {/* All Day Event Checkbox */}
              <div className="lg:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Event Type</label>
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 h-[40px]">
                  <input
                    {...register('isAllDay')}
                    type="checkbox"
                    id="isAllDay"
                    disabled={isLoading}
                    className="w-4 h-4 text-[#F25129] border-gray-300 rounded focus:ring-[#F25129]"
                  />
                  <label htmlFor="isAllDay" className="text-xs font-medium text-gray-700 cursor-pointer">
                    All Day
                  </label>
                </div>
              </div>
              
              {/* Duration Field - Only show when not all-day */}
              {!watchedIsAllDay && (
                <div className="lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Duration</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        {...register('duration')}
                        type="number"
                        min="0.5"
                        max="168"
                        step="0.5"
                        disabled={isLoading}
                        className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border ${errors.duration ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                        placeholder="1"
                      />
                    </div>
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">hrs</span>
                  </div>
                  {errors.duration && <p className="mt-1 text-xs text-red-600">{errors.duration.message}</p>}
                </div>
              )}
            </div>
            
            {/* Row 2: End Date & Time - Aligned with Start fields */}
            {!watch('isAllDay') && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mt-3">
                <div className="lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      {...register('endDate')}
                      type="date"
                      disabled={isLoading}
                      onChange={(e) => {
                        setIsManuallyOverridden(true);
                        register('endDate').onChange(e);
                      }}
                      className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border ${errors.endDate ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                    />
                  </div>
                  {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate.message}</p>}
                </div>
                
                <div className="lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
                  <div className="relative">
                    <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      {...register('endTime')}
                      type="time"
                      disabled={isLoading}
                      onChange={(e) => {
                        setIsManuallyOverridden(true);
                        register('endTime').onChange(e);
                      }}
                      className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border ${errors.endTime ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                    />
                  </div>
                  {errors.endTime && <p className="mt-1 text-xs text-red-600">{errors.endTime.message}</p>}
                </div>
                
                {/* Empty space for alignment */}
                <div className="lg:col-span-2"></div>
              </div>
            )}
            
          </div>

          {/* Manual Override Indicator - Only show when not all-day */}
          {!watch('isAllDay') && isManuallyOverridden && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">Manual Override</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsManuallyOverridden(false);
                    // Recalculate from duration
                    if (watchedDuration && watchedDate && watchedTime) {
                      const durationHours = parseFloat(watchedDuration);
                      if (!isNaN(durationHours) && durationHours > 0) {
                        const [hours, minutes] = watchedTime.split(':').map(Number);
                        const startDateTime = new Date();
                        startDateTime.setHours(hours, minutes, 0, 0);
                        
                        const endDateTime = new Date(startDateTime.getTime() + (durationHours * 60 * 60 * 1000));
                        const endTimeString = endDateTime.toTimeString().slice(0, 5);
                        
                        const endDate = new Date(watchedDate);
                        if (endDateTime.getHours() < hours || (endDateTime.getHours() === hours && endDateTime.getMinutes() < minutes)) {
                          endDate.setDate(endDate.getDate() + 1);
                        }
                        
                        setValue('endTime', endTimeString);
                        setValue('endDate', safeISODate(endDate));
                      }
                    }
                  }}
                  className="text-xs text-yellow-700 hover:text-yellow-800 underline"
                >
                  Reset to Auto
                </button>
              </div>
              <p className="text-xs text-yellow-700 mt-1">
                End date/time manually set. Duration field ignored.
              </p>
            </div>
          )}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Venue Name (Optional)</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('venueName')}
                type="text"
                disabled={isLoading}
                onChange={(e) => handleVenueNameInput(e.target.value)}
                onFocus={() => {
                  if (venueSuggestions.length > 0) {
                    setShowVenueSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Delay hiding suggestions to allow clicking on them
                  setTimeout(() => setShowVenueSuggestions(false), 200);
                }}
                className={`w-full pl-10 pr-10 py-3 rounded-lg border ${errors.venueName ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent`}
                placeholder="Start typing venue name..."
                autoComplete="off"
              />
              {isVenueLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#F25129] animate-spin" />
              )}
              {!isVenueLoading && watch('venueName') && (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              )}
            </div>
            
            {/* Venue Suggestions Dropdown */}
            {showVenueSuggestions && venueSuggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {venueSuggestions.map((venue) => (
                  <button
                    key={venue.id}
                    type="button"
                    onClick={() => selectVenue(venue)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {venue.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {venue.address}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {venue.category === 'amenity' ? '📍' : '🏢'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <p className="text-xs text-gray-500 mt-1">
              💡 Select a venue from suggestions to auto-fill both name and address
            </p>
            {errors.venueName && <p className="mt-1 text-sm text-red-600">{errors.venueName.message}</p>}
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Address (Optional)</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('venueAddress')}
                type="text"
                disabled={isLoading}
                onChange={(e) => handleAddressInput(e.target.value)}
                onFocus={() => {
                  if (addressSuggestions.length > 0) {
                    setShowAddressSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Delay hiding suggestions to allow clicking on them
                  setTimeout(() => setShowAddressSuggestions(false), 200);
                }}
                className={`w-full pl-10 pr-10 py-3 rounded-lg border ${errors.venueAddress ? 'border-red-300' : 'border-gray-300'} focus:ring-2 focus:ring-[#F25129] focus:border-transparent`}
                placeholder="Start typing address..."
                autoComplete="off"
              />
              {isAddressLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
              )}
              {!isAddressLoading && watch('venueAddress') && (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              )}
            </div>
            
            {/* Address Suggestions Dropdown - Fixed positioning */}
            {showAddressSuggestions && addressSuggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {addressSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => selectAddress(suggestion)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {suggestion.mainText}
                        </div>
                        {suggestion.secondaryText && (
                          <div className="text-xs text-gray-500 truncate">
                            {suggestion.secondaryText}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {suggestion.category === 'amenity' ? '📍' : '🏠'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {errors.venueAddress && <p className="mt-1 text-sm text-red-600">{errors.venueAddress.message}</p>}
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
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="Add tags (e.g., yoga, running)"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map(t => (
                <span key={t} className="px-3 py-1 bg-[#F25129]/10 text-[#F25129] rounded-full text-sm">
                  {t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))} className="ml-2">x</button>
                </span>
              ))}
            </div>
          </div>
          {/* Single Row: Max Attendees and Waitlist Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Capacity & Waitlist Settings</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Max Attendees */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Attendees (Optional)</label>
                <div className="relative">
                  <Users className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    {...register('maxAttendees')}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    disabled={isLoading}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    placeholder="No limit"
                  />
                </div>
              </div>
              
              {/* Waitlist Enable */}
              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={waitlistEnabled}
                    onChange={(e) => setWaitlistEnabled(e.target.checked)}
                    disabled={isLoading}
                    className="rounded border-gray-300 text-[#F25129] focus:ring-[#F25129]"
                  />
                  <span className="text-xs text-gray-700">Enable waitlist</span>
                </label>
              </div>
              
              {/* Waitlist Limit */}
              {waitlistEnabled && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Waitlist Limit (Optional)</label>
                  <input
                    {...register('waitlistLimit')}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    placeholder="No limit"
                  />
                </div>
              )}

              {/* Waitlist Count - Current People Waiting */}
              {waitlistEnabled && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Current Waitlist Count</label>
                  <input
                    {...register('waitlistCount')}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    placeholder="0"
                    value={waitlistCount}
                    onChange={(e) => setWaitlistCount(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Number of people currently on the waitlist</p>
                </div>
              )}
            </div>
          </div>

          {/* Read-Only Event Setting */}
          <div>
            <label className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <input
                type="checkbox"
                checked={isReadOnly}
                onChange={(e) => setIsReadOnly(e.target.checked)}
                disabled={isLoading}
                className="rounded border-gray-300 text-[#F25129] focus:ring-[#F25129]"
              />
              <div>
                <span className="text-sm font-medium text-blue-900">Read-Only Event</span>
                <p className="text-xs text-blue-700 mt-1">
                  This event will be displayed without RSVP functionality. Users can view event details but cannot register to attend.
                </p>
              </div>
            </label>
          </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Event Image (Optional)</label>
              
              {/* Current Image Display (when editing) */}
              {isEditing && eventToEdit?.imageUrl && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Current Image:</span>
                    <button
                      type="button"
                      onClick={() => {
                        console.log('🔍 Remove Image clicked!');
                        console.log('🔍 Before removal - imageRemoved:', imageRemoved);
                        console.log('🔍 Before removal - eventToEdit.imageUrl:', eventToEdit?.imageUrl);
                        
                        // Soft delete - clear the imageUrl but don't delete from storage
                        setSelectedFile(null);
                        setImageRemoved(true); // Mark that image was removed
                        // Clear the imageUrl field using React Hook Form
                        setValue('imageUrl', '');
                        // Update the eventToEdit object to reflect the change
                        if (eventToEdit) {
                          eventToEdit.imageUrl = '';
                        }
                        
                        console.log('🔍 After removal - imageRemoved:', true);
                        console.log('🔍 After removal - eventToEdit.imageUrl:', eventToEdit?.imageUrl);
                        
                        toast.success('Image removed from event (will be saved when you update)');
                      }}
                      className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      Remove Image
                    </button>
                  </div>
                  <div className="relative w-full h-48 overflow-hidden rounded-lg bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10">
                    <img
                      src={eventToEdit.imageUrl}
                      alt={eventToEdit.title}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    {/* Overlay when image is marked for removal */}
                    {imageRemoved && (
                      <div className="absolute inset-0 bg-red-500 bg-opacity-90 flex items-center justify-center rounded-lg">
                        <div className="text-center text-white">
                          <div className="mb-2">
                            <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="font-bold text-lg mb-1">Image Removed</div>
                          <div className="text-sm opacity-90">This image will be deleted when you save</div>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {imageRemoved 
                      ? (
                        <span className="flex items-center gap-2 text-red-600 font-medium">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          ⚠️ Image has been removed and will be deleted when you update the event.
                        </span>
                      )
                      : 'Click "Remove Image" to remove this image from the event. The image file will remain in storage.'
                    }
                  </p>
                </div>
              )}
              
              {/* Single Row: File Upload and URL Input */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Upload Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isLoading}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                  />
                  {selectedFile && (
                    <p className="text-xs text-green-600 mt-1">
                      📎 {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Or Image URL</label>
                  <input
                    {...register('imageUrl')}
                    type="url"
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>
            </div>
          
          {/* QR Code Attendance Toggle */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <QrCode className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-blue-900">
                    QR Code Attendance Tracking
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      {...register('attendanceEnabled')}
                      type="checkbox"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-xs text-blue-700">
                  Enable QR code scanning for event check-ins. Attendees can scan a QR code to automatically record their attendance.
                </p>
              </div>
            </div>
          </div>
          
          {/* Event Visibility Selection */}
          <div className="space-y-4 pt-4">
            <label className="block text-sm font-medium text-gray-700">Event Visibility</label>
            {currentUser?.role !== 'admin' && (
              <p className="text-xs text-gray-500 bg-blue-50 p-2 rounded-lg border border-blue-200">
                💡 Events are public by default. Only administrators can change visibility settings.
              </p>
            )}
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={eventVisibility === 'public'}
                  onChange={(e) => setEventVisibility(e.target.value as 'public' | 'members' | 'private')}
                  disabled={isLoading}
                  className="h-4 w-4 text-[#F25129] focus:ring-[#F25129]"
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
                  disabled={isLoading || currentUser?.role !== 'admin'}
                  className="h-4 w-4 text-[#F25129] focus:ring-[#F25129] disabled:opacity-50"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">👥 Members Only</span>
                  <p className="text-xs text-gray-500">Visible to platform members only {currentUser?.role !== 'admin' && '(Admin only)'}</p>
                </div>
              </label>
              
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={eventVisibility === 'private'}
                  onChange={(e) => setEventVisibility(e.target.value as 'public' | 'members' | 'private')}
                  disabled={isLoading || currentUser?.role !== 'admin'}
                  className="h-4 w-4 text-[#F25129] focus:ring-[#F25129] disabled:opacity-50"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">🔒 Private Event</span>
                  <p className="text-xs text-gray-500">Invitation only, select specific users {currentUser?.role !== 'admin' && '(Admin only)'}</p>
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
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129]"
                  />
                  <button
                    type="button"
                    onClick={handleUserSearch}
                    disabled={isLoading || !userSearchQuery.trim() || isSearching}
                    className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] disabled:opacity-50"
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
                            disabled={invitedUserIds.includes(user.id)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              invitedUserIds.includes(user.id)
                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                            title={invitedUserIds.includes(user.id) ? 'Already invited' : 'Invite user'}
                          >
                            {invitedUserIds.includes(user.id) ? 'Invited' : 'Invite'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Invited Users List */}
                {invitedUserIds.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Invited Users ({invitedUserIds.length}):
                    </label>
                    <div className="space-y-2">
                      {invitedUserIds.map((userId, index) => {
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

          {/* Payment Configuration */}
          <div className="space-y-4 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Payment Configuration</h3>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={requiresPayment}
                  onChange={(e) => {
                    setRequiresPayment(e.target.checked);
                    setValue('requiresPayment', e.target.checked);
                  }}
                  disabled={isLoading}
                  className="h-4 w-4 text-[#F25129] focus:ring-[#F25129]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Require Payment</span>
                  <p className="text-xs text-gray-500">Enable payment collection for this event</p>
                </div>
              </label>

              {requiresPayment && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Adult Price ($)</label>
                      <input
                        {...register('adultPrice')}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                        placeholder="25.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                      <select
                        {...register('currency')}
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="CAD">CAD (C$)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Teens (11+) ($)</label>
                      <input
                        {...register('teenPrice')}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                        placeholder="20.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Children (3-10) ($)</label>
                      <input
                        {...register('childPrice')}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                        placeholder="15.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Infants (0-2) ($)</label>
                      <input
                        {...register('infantPrice')}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        {...register('refundAllowed')}
                        disabled={isLoading}
                        className="h-4 w-4 text-[#F25129] focus:ring-[#F25129]"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">Allow Refunds</span>
                        <p className="text-xs text-gray-500">Enable refunds for this event</p>
                      </div>
                    </label>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Refund Deadline (Optional)</label>
                      <input
                        {...register('refundDeadline')}
                        type="date"
                        disabled={isLoading}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave empty to allow refunds until event date</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold rounded-lg hover:from-[#E0451F] hover:to-[#E55A2A] disabled:opacity-50"
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