import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Calendar, MessageSquare, Eye, Search, Video, Image, Trash2, CheckCircle, XCircle, Star, Loader2, RefreshCw, ChevronDown, ChevronUp, Users, Dumbbell, Settings, UserCheck, Shield, ShieldCheck, FolderTree } from 'lucide-react';
import { getDocs, collection, query, where, limit, writeBatch, serverTimestamp, orderBy, deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, DocumentReference } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import EventCardNew from '../components/events/EventCardNew';
import ContactMessagesAdmin from '../components/admin/ContactMessagesAdmin';
import AccountApprovalsAdmin from '../components/admin/AccountApprovalsAdmin';
import BulkAttendeesPanel from '../components/admin/BulkAttendeesPanel';
import CleanupToolPanel from '../components/admin/CleanupToolPanel';
import { AssistantConfigPanel } from '../components/admin/AssistantConfigPanel';
import { KBGapsPanel } from '../components/admin/KBGapsPanel';
import { ContentModerationPanel } from '../components/admin/ContentModerationPanel';
import { TrustedUsersPanel } from '../components/admin/TrustedUsersPanel';
import { SupportToolCategoriesPanel } from '../components/admin/SupportToolCategoriesPanel';
import { useTestimonials } from '../hooks/useTestimonials';
import { adminUpdateTestimonial, deleteTestimonial } from '../services/testimonialsService';
import { ModerationService } from '../services/moderationService';
import type { Testimonial, TestimonialStatus, TestimonialAIPrompts, PostAIPrompts } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ExercisesAdminLazy = React.lazy(() => import('./admin/ExercisesAdmin'));

interface Event {
  id: string;
  title: string;
  description?: string;
  startAt: any;
  endAt?: any;
  duration?: number;
  visibility?: 'public' | 'members' | 'private';
  createdBy?: string;
  invitedUserIds?: string[];
  tags?: string[];
  allDay?: boolean;
  location?: string;
  venueName?: string;
  venueAddress?: string;
  imageUrl?: string;
  isTeaser?: boolean;
  maxAttendees?: number;
  attendingCount?: number;
  qrCode?: string;
  qrCodeGeneratedAt?: any;
  attendanceEnabled?: boolean;
  attendanceCount?: number;
  lastAttendanceUpdate?: any;
}

type ProfileAdminTabProps = {
  allEvents: Event[];
  userNames: { [userId: string]: string };
  setEventToEdit: (value: Event | null) => void;
  setIsCreateModalOpen: (value: boolean) => void;
  shareEvent: (event: Event) => Promise<void>;
  blockUserFromRsvp: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  loadingAdminEvents: boolean;
  blockedUsers: { id: string; displayName: string; email: string; blockedAt: any }[];
  loadingBlockedUsers: boolean;
};

export const ProfileAdminTab: React.FC<ProfileAdminTabProps> = ({
  allEvents,
  userNames,
  setEventToEdit,
  setIsCreateModalOpen,
  shareEvent,
  blockUserFromRsvp,
  unblockUser,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  loadingAdminEvents,
  blockedUsers,
  loadingBlockedUsers,
}) => {
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFixingStuckProcessing, setIsFixingStuckProcessing] = useState(false);
  const [activeAdminSection, setActiveAdminSection] = useState<'events' | 'bulkAttendance' | 'workouts' | 'messages' | 'users' | 'media' | 'maintenance' | 'testimonials' | 'posts' | 'assistantConfig' | 'kbGaps' | 'accountApprovals' | 'moderation' | 'trustedUsers' | 'supportToolCategories'>('events');
  const { currentUser } = useAuth();
  
  // Media management state
  const [allMedia, setAllMedia] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaPage, setMediaPage] = useState(0);
  const MEDIA_PAGE_SIZE = 10;
  const [expandedMediaId, setExpandedMediaId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Testimonials moderation state
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<TestimonialStatus | 'all'>('pending');
  const [testimonialTab, setTestimonialTab] = useState<'moderation' | 'ai-prompts'>('moderation');
  const { testimonials, loading: loadingTestimonials, error: testimonialsError } = useTestimonials({
    statuses: ['pending', 'published', 'rejected'],
    orderByField: 'updatedAt',
    orderDirection: 'desc',
    prioritizeFeatured: false,
  });

  // AI Prompts management state
  const [aiPrompts, setAiPrompts] = useState<TestimonialAIPrompts>({
    id: 'testimonialGeneration',
    communityContext: '',
    guidelines: '',
    exampleActivities: [],
    exampleEvents: [],
    tone: '',
    updatedAt: new Date(),
  });
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [savingPrompts, setSavingPrompts] = useState(false);

  // Posts AI Prompts management state
  const [postAiPrompts, setPostAiPrompts] = useState<PostAIPrompts>({
    id: 'postGeneration',
    communityContext: '',
    guidelines: '',
    exampleTopics: [],
    examplePostTypes: [],
    tone: '',
    updatedAt: new Date(),
  });
  const [loadingPostPrompts, setLoadingPostPrompts] = useState(false);
  const [savingPostPrompts, setSavingPostPrompts] = useState(false);

  const filteredTestimonials = useMemo(() => {
    if (selectedStatusFilter === 'all') {
      return testimonials;
    }
    return testimonials.filter((testimonial) => testimonial.status === selectedStatusFilter);
  }, [selectedStatusFilter, testimonials]);

  const statusLabels: Record<TestimonialStatus, { label: string; className: string }> = {
    pending: { label: 'Pending Review', className: 'bg-amber-100 text-amber-700' },
    published: { label: 'Published', className: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: 'Rejected', className: 'bg-gray-200 text-gray-600' },
  };

  const handleTestimonialStatusChange = async (testimonial: Testimonial, nextStatus: TestimonialStatus) => {
    if (!currentUser) return;
    const isPublishing = nextStatus === 'published';

    try {
      await adminUpdateTestimonial(testimonial.id, {
        status: nextStatus,
        reviewerId: currentUser.id,
      });

      toast.success(
        isPublishing ? 'Testimonial published successfully.' : nextStatus === 'pending' ? 'Testimonial moved back to pending.' : 'Testimonial was rejected.'
      );
    } catch (err: any) {
      console.error('[ProfileAdminTab] Failed to update testimonial status', err);
      toast.error(err?.message ?? 'Unable to update testimonial.');
    }
  };

  const handleToggleFeatured = async (testimonial: Testimonial) => {
    try {
      await adminUpdateTestimonial(testimonial.id, {
        featured: !testimonial.featured,
      });
      toast.success(testimonial.featured ? 'Removed from featured.' : 'Marked as featured.');
    } catch (err: any) {
      console.error('[ProfileAdminTab] Failed to toggle featured', err);
      toast.error(err?.message ?? 'Unable to update featured state.');
    }
  };

  const handleDeleteTestimonial = async (testimonial: Testimonial) => {
    const confirm = window.confirm('Delete this testimonial permanently? This action cannot be undone.');
    if (!confirm) return;

    try {
      await deleteTestimonial(testimonial.id);
      toast.success('Testimonial deleted.');
    } catch (err: any) {
      console.error('[ProfileAdminTab] Failed to delete testimonial', err);
      toast.error(err?.message ?? 'Unable to delete testimonial.');
    }
  };

  // Load AI prompts from Firestore
  const loadAIPrompts = async () => {
    if (!currentUser) return;
    
    setLoadingPrompts(true);
    try {
      const promptsRef = doc(db, 'aiPrompts', 'testimonialGeneration');
      const promptsSnap = await getDoc(promptsRef);
      
      if (promptsSnap.exists()) {
        const data = promptsSnap.data();
        setAiPrompts({
          id: 'testimonialGeneration',
          communityContext: data.communityContext || '',
          guidelines: data.guidelines || '',
          exampleActivities: data.exampleActivities || [],
          exampleEvents: data.exampleEvents || [],
          tone: data.tone || '',
          updatedAt: data.updatedAt?.toDate() || new Date(),
          updatedBy: data.updatedBy || '',
        });
      } else {
        // Initialize with defaults if document doesn't exist
        const defaultPrompts: TestimonialAIPrompts = {
          id: 'testimonialGeneration',
          communityContext: 'Moms Fitness Mojo is a fitness and wellness community for moms in Short Hills, Millburn, and surrounding New Jersey areas. We offer workouts (yoga, pilates, HIIT, strength training), hikes, tennis, dance sessions, fitness challenges, social events (brunches, dinners, cocktail nights), and festival celebrations. The community values friendship, accountability, wellness, and helping moms rediscover themselves beyond their roles as mothers.',
          guidelines: '- Be authentic and heartfelt\n- Mention specific experiences, events, or moments when possible\n- Share a fuller story (aim for 600-1500 characters)\n- Make it personal and relatable\n- Focus on community, fitness, empowerment, and friendship\n- Each testimonial should be unique',
          exampleActivities: ['Saturday morning walks', 'yoga sessions', 'hiking trails', 'tennis matches', 'dance classes', 'fitness challenges', 'brunch meetups', 'cocktail nights'],
          exampleEvents: ['community hikes', 'fitness workshops', 'social brunches', 'dance sessions', 'wellness events'],
          tone: 'warm, supportive, empowering, authentic',
          updatedAt: new Date(),
        };
        setAiPrompts(defaultPrompts);
      }
    } catch (error: any) {
      console.error('[ProfileAdminTab] Failed to load AI prompts', error);
      toast.error('Failed to load AI prompts');
    } finally {
      setLoadingPrompts(false);
    }
  };

  // Save AI prompts to Firestore
  const saveAIPrompts = async () => {
    if (!currentUser) return;

    setSavingPrompts(true);
    try {
      const promptsRef = doc(db, 'aiPrompts', 'testimonialGeneration');
      await setDoc(promptsRef, {
        communityContext: aiPrompts.communityContext.trim(),
        guidelines: aiPrompts.guidelines.trim(),
        exampleActivities: aiPrompts.exampleActivities.filter(a => a.trim()),
        exampleEvents: aiPrompts.exampleEvents.filter(e => e.trim()),
        tone: aiPrompts.tone.trim(),
        updatedAt: Timestamp.now(),
        updatedBy: currentUser.id,
      }, { merge: true });

      setAiPrompts(prev => ({ ...prev, updatedAt: new Date() }));
      toast.success('AI prompts saved successfully!');
    } catch (error: any) {
      console.error('[ProfileAdminTab] Failed to save AI prompts', error);
      toast.error(error?.message ?? 'Failed to save AI prompts');
    } finally {
      setSavingPrompts(false);
    }
  };

  // Load prompts when AI prompts tab is active
  useEffect(() => {
    if (activeAdminSection === 'testimonials' && testimonialTab === 'ai-prompts') {
      loadAIPrompts();
    }
  }, [activeAdminSection, testimonialTab]);

  // Load Post AI prompts from Firestore
  const loadPostAIPrompts = async () => {
    if (!currentUser) return;
    setLoadingPostPrompts(true);
    try {
      const promptsRef = doc(db, 'aiPrompts', 'postGeneration');
      const promptsSnap = await getDoc(promptsRef);

      if (promptsSnap.exists()) {
        const data = promptsSnap.data();
        setPostAiPrompts({
          id: 'postGeneration',
          communityContext: data.communityContext || '',
          guidelines: data.guidelines || '',
          exampleTopics: data.exampleTopics || [],
          examplePostTypes: data.examplePostTypes || [],
          tone: data.tone || '',
          updatedAt: data.updatedAt?.toDate() || new Date(),
          updatedBy: data.updatedBy || '',
        });
      } else {
        // Initialize sensible defaults
        setPostAiPrompts({
          id: 'postGeneration',
          communityContext: 'Moms Fitness Mojo is a supportive fitness and wellness community for moms.',
          guidelines: '- Be authentic and engaging\n- Keep it conversational\n- Encourage community engagement',
          exampleTopics: ['fitness progress', 'workout tips', 'motivation', 'community events'],
          examplePostTypes: ['progress update', 'question', 'motivational', 'event share'],
          tone: 'warm, encouraging, authentic, community-focused',
          updatedAt: new Date(),
        });
      }
    } catch (error: any) {
      console.error('[ProfileAdminTab] Failed to load Post AI prompts', error);
      toast.error('Failed to load Post AI prompts');
    } finally {
      setLoadingPostPrompts(false);
    }
  };

  // Save Post AI prompts to Firestore
  const savePostAIPrompts = async () => {
    if (!currentUser) return;
    setSavingPostPrompts(true);
    try {
      const promptsRef = doc(db, 'aiPrompts', 'postGeneration');
      await setDoc(promptsRef, {
        communityContext: postAiPrompts.communityContext.trim(),
        guidelines: postAiPrompts.guidelines.trim(),
        exampleTopics: postAiPrompts.exampleTopics.filter(t => t.trim()),
        examplePostTypes: postAiPrompts.examplePostTypes.filter(t => t.trim()),
        tone: postAiPrompts.tone.trim(),
        updatedAt: Timestamp.now(),
        updatedBy: currentUser.id,
      }, { merge: true });

      setPostAiPrompts(prev => ({ ...prev, updatedAt: new Date() }));
      toast.success('Post AI prompts saved successfully!');
    } catch (error: any) {
      console.error('[ProfileAdminTab] Failed to save Post AI prompts', error);
      toast.error(error?.message ?? 'Failed to save Post AI prompts');
    } finally {
      setSavingPostPrompts(false);
    }
  };

  // Load when Posts section is active
  useEffect(() => {
    if (activeAdminSection === 'posts') {
      loadPostAIPrompts();
    }
  }, [activeAdminSection]);

  // Search users by name or email
  const handleSearchUsers = async () => {
    if (!userSearchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // Search users in Firestore by displayName or email
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('displayName', '>=', userSearchQuery),
        where('displayName', '<=', userSearchQuery + '\uf8ff'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          displayName: data?.displayName || 'Unknown User',
          email: data?.email || 'No email',
          blockedFromRsvp: data?.blockedFromRsvp || false
        };
      });
      
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search users:', error);
      toast.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  // Block a user from RSVPing
  const handleBlockUser = async (userId: string) => {
    try {
      // For now, use the old blocking system to maintain compatibility
      await blockUserFromRsvp(userId);
      toast.success('User blocked from RSVPing');
      setSearchResults(prev => prev.map(user => 
        user.id === userId ? { ...user, blockedFromRsvp: true } : user
      ));
    } catch (error) {
      console.error('Failed to block user:', error);
      toast.error('Failed to block user');
    }
  };

  // Unblock a user
  const handleUnblockUser = async (userId: string) => {
    try {
      await unblockUser(userId);
      toast.success('User unblocked');
      setSearchResults(prev => prev.map(user => 
        user.id === userId ? { ...user, blockedFromRsvp: false } : user
      ));
    } catch (error) {
      console.error('Failed to unblock user:', error);
      toast.error('Failed to unblock user');
    }
  };

  // Load all media files
  const loadAllMedia = async () => {
    setLoadingMedia(true);
    try {
      const mediaRef = collection(db, 'media');
      const q = query(mediaRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const media = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));
      
      setAllMedia(media);
    } catch (error) {
      console.error('Failed to load media:', error);
      toast.error('Failed to load media files');
    } finally {
      setLoadingMedia(false);
    }
  };

  // Delete media file
  const handleDeleteMedia = async (mediaId: string, mediaData: any) => {
    if (!confirm('Are you sure you want to delete this media file? This cannot be undone.')) return;
    
    try {
      console.log('🗑️ [ADMIN] Starting deletion for media:', {
        mediaId,
        filePath: mediaData.filePath,
        thumbnailPath: mediaData.thumbnailPath,
        type: mediaData.type
      });

      // Only delete from Firestore - Cloud Function will handle storage cleanup
      await deleteDoc(doc(db, 'media', mediaId));
      console.log('🗑️ [ADMIN] Firestore document deleted - Cloud Function will handle storage cleanup');
      
      // Update local state
      setAllMedia(prev => prev.filter(m => m.id !== mediaId));
      toast.success('Media file deleted successfully');
    } catch (error) {
      console.error('Failed to delete media:', error);
      toast.error('Failed to delete media file');
    }
  };

  // Update media status manually
  const handleUpdateMediaStatus = async (mediaId: string, newStatus: 'processing' | 'ready' | 'failed', reason?: string) => {
    setUpdatingStatus(mediaId);
    try {
      const mediaRef = doc(db, 'media', mediaId);
      const updateData: any = {
        transcodeStatus: newStatus,
        transcodeUpdatedAt: serverTimestamp(),
        manualStatusUpdate: true,
        manualStatusUpdateAt: serverTimestamp(),
        manualStatusUpdateBy: currentUser?.id,
      };
      
      if (newStatus === 'failed' && reason) {
        updateData.transcodeError = reason;
        updateData.transcodingMessage = reason;
      } else if (newStatus === 'ready') {
        updateData.transcodingMessage = 'Manually marked as ready';
      } else if (newStatus === 'processing') {
        updateData.transcodingMessage = 'Manually reset to processing - will reprocess';
      }
      
      await updateDoc(mediaRef, updateData);
      
      // Update local state
      setAllMedia(prev => prev.map(m => 
        m.id === mediaId 
          ? { ...m, transcodeStatus: newStatus, ...updateData }
          : m
      ));
      
      toast.success(`Media status updated to ${newStatus}`);
    } catch (error) {
      console.error('Failed to update media status:', error);
      toast.error('Failed to update media status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Fix stuck processing videos - improved to check HLS files
  const handleFixStuckProcessing = async () => {
    setIsFixingStuckProcessing(true);
    try {
      // Get all media documents that are stuck in processing
      const mediaRef = collection(db, 'media');
      const q = query(mediaRef, where('transcodeStatus', '==', 'processing'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        toast.success('No stuck processing files found');
        setIsFixingStuckProcessing(false);
        return;
      }
      
      toast.loading(`Checking ${snapshot.docs.length} stuck files...`, { id: 'fix-stuck' });
      
      type PendingUpdate = { ref: DocumentReference; data: Record<string, any> };
      const pendingUpdates: PendingUpdate[] = [];
      let fixedCount = 0;
      let readyCount = 0;
      let failedCount = 0;
      const now = new Date();
      const readyIds: string[] = [];
      const failedIds: string[] = [];
      
      // Check each file
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
        const hoursStuck = createdAt ? (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
        
        // Check if HLS files exist in Storage
        let hasHlsFiles = false;
        if (data.filePath && data.type === 'video') {
          try {
            const folderPath = data.filePath.substring(0, data.filePath.lastIndexOf('/'));
            const hlsFolderRef = ref(storage, `${folderPath}/hls/`);
            const hlsList = await listAll(hlsFolderRef);
            hasHlsFiles = hlsList.items.length > 0;
          } catch (error) {
            // If folder doesn't exist or error, assume no HLS files
            hasHlsFiles = false;
          }
        }
        
        // Check if HLS exists in Firestore
        const hasHlsInFirestore = !!data.sources?.hls || !!data.sources?.hlsMaster;
        
        // Fix if:
        // 1. Has HLS files but status is still processing
        // 2. Stuck for more than 2 hours and no HLS files (mark as failed)
        if (hasHlsFiles || hasHlsInFirestore) {
          // Has HLS - mark as ready
          pendingUpdates.push({
            ref: doc.ref,
            data: {
            transcodeStatus: 'ready',
            lastManualFix: serverTimestamp(),
            manualFixReason: 'HLS files exist but status was stuck in processing',
            updatedAt: serverTimestamp()
            },
          });
          fixedCount++;
          readyCount++;
          readyIds.push(doc.id);
        } else if (hoursStuck > 2) {
          // No HLS and stuck >2 hours - mark as failed
          pendingUpdates.push({
            ref: doc.ref,
            data: {
            transcodeStatus: 'failed',
            lastManualFix: serverTimestamp(),
            manualFixReason: 'Stuck in processing for more than 2 hours with no HLS files',
            updatedAt: serverTimestamp()
            },
          });
          fixedCount++;
          failedCount++;
          failedIds.push(doc.id);
        }
      }
      
      if (fixedCount > 0) {
        const CHUNK_SIZE = 400;
        for (let i = 0; i < pendingUpdates.length; i += CHUNK_SIZE) {
          const chunk = pendingUpdates.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(({ ref, data }) => batch.update(ref, data));
          await batch.commit();
        }

        if (import.meta.env.DEV) {
          console.info('[Admin] Fix stuck processing summary', {
            readyIds,
            failedIds,
          });
        }
        toast.success(
          `Fixed ${fixedCount} stuck files: ${readyCount} marked ready, ${failedCount} marked failed`,
          { id: 'fix-stuck', duration: 5000 }
        );
        // Reload media to show updated status
        loadAllMedia();
      } else {
        toast.success('No files need fixing (all are legitimately processing)', { id: 'fix-stuck' });
      }
    } catch (error) {
      console.error('Failed to fix stuck processing:', error);
      toast.error('Failed to fix stuck processing files', { id: 'fix-stuck' });
    } finally {
      setIsFixingStuckProcessing(false);
    }
  };

  // Load media when media section is active
  useEffect(() => {
    if (activeAdminSection === 'media') {
      loadAllMedia();
    }
  }, [activeAdminSection]);

  // Debug logging moved to useEffect to prevent setState during render
  useEffect(() => {
    console.log('🔍 ProfileAdminTab: Current state', {
      allEvents: allEvents.length,
      loadingAdminEvents,
      eventsPage,
      PAGE_SIZE,
      activeAdminSection,
      eventsData: allEvents.map(e => ({ id: e.id, title: e.title, createdBy: e.createdBy }))
    });
  }, [allEvents, loadingAdminEvents, eventsPage, activeAdminSection]);

  return (
    <div className="grid gap-6">
      {/* Admin Section Navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveAdminSection('events')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'events'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Event Management
        </button>
        <button
          onClick={() => setActiveAdminSection('bulkAttendance')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'bulkAttendance'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Bulk Attendees
        </button>
        <button
          onClick={() => setActiveAdminSection('workouts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'workouts'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Dumbbell className="w-4 h-4 inline mr-2" />
          Workout Library
        </button>
        <button
          onClick={() => setActiveAdminSection('messages')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'messages'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          Contact Messages
        </button>
        <button
          onClick={() => setActiveAdminSection('accountApprovals')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'accountApprovals'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <UserCheck className="w-4 h-4 inline mr-2" />
          Account Approvals
        </button>
        <button
          onClick={() => setActiveAdminSection('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'users'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Eye className="w-4 h-4 inline mr-2" />
          User Management
        </button>
        <button
          onClick={() => setActiveAdminSection('media')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'media'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Video className="w-4 h-4 inline mr-2" />
          Media Management
        </button>
        <button
          onClick={() => setActiveAdminSection('maintenance')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'maintenance'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Search className="w-4 h-4 inline mr-2" />
          System Tools
        </button>
        <button
          onClick={() => setActiveAdminSection('testimonials')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'testimonials'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          Testimonials
        </button>
        <button
          onClick={() => setActiveAdminSection('posts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'posts'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          Posts
        </button>
        <button
          onClick={() => setActiveAdminSection('assistantConfig')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'assistantConfig'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          Assistant Config
        </button>
        <button
          onClick={() => setActiveAdminSection('kbGaps')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'kbGaps'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          KB Gaps
        </button>
        <button
          onClick={() => setActiveAdminSection('moderation')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'moderation'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Shield className="w-4 h-4 inline mr-2" />
          Content Moderation
        </button>
        <button
          onClick={() => setActiveAdminSection('trustedUsers')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'trustedUsers'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4 inline mr-2" />
          Trusted Users
        </button>
        <button
          onClick={() => setActiveAdminSection('supportToolCategories')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'supportToolCategories'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FolderTree className="w-4 h-4 inline mr-2" />
          Support Tool Categories
        </button>
      </div>

      {/* Event Management Section */}
      {activeAdminSection === 'events' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-700">Admin Event Management</h2>
            <span className="text-xs text-gray-500">({allEvents.length} events)</span>
            <button
              onClick={() => {
                setEventToEdit(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full hover:from-[#E0451F] hover:to-[#E55A2B]"
              aria-label="Create new event"
            >
              Create New Event
            </button>
            <button
              onClick={() => setActiveAdminSection('bulkAttendance')}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full hover:from-blue-700 hover:to-blue-800"
              aria-label="Bulk add attendees"
            >
              Bulk Add Attendees
            </button>
          </div>
          {loadingAdminEvents ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
                <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-gray-500">Loading admin events...</p>
            </div>
          ) : allEvents.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No events found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                const startIndex = eventsPage * PAGE_SIZE;
                const endIndex = (eventsPage + 1) * PAGE_SIZE;
                const paginatedEvents = allEvents.slice(startIndex, endIndex);
                
                // Debug logging
                if (import.meta.env.DEV) {
                  console.log('🔍 ProfileAdminTab: Event Management Display', {
                    totalEvents: allEvents.length,
                    eventsPage,
                    PAGE_SIZE,
                    startIndex,
                    endIndex,
                    paginatedEventsCount: paginatedEvents.length,
                    eventIds: paginatedEvents.map(e => e.id),
                    allEventIds: allEvents.map(e => e.id)
                  });
                }
                
                if (paginatedEvents.length === 0 && allEvents.length > 0) {
                  console.warn('⚠️ ProfileAdminTab: No events in paginated slice but allEvents has events', {
                    eventsPage,
                    PAGE_SIZE,
                    totalEvents: allEvents.length
                  });
                  // Reset to page 0 if current page has no events
                  if (eventsPage > 0) {
                    setEventsPage(0);
                    return null; // Will re-render with page 0
                  }
                }
                
                return paginatedEvents.map((event, index) => (
                  <div 
                    key={event.id} 
                    className={`space-y-4 p-4 rounded-lg ${
                      index % 2 === 0 
                        ? 'bg-orange-50/50 border-l-4 border-orange-200' 
                        : 'bg-[#FFC107]/10 border-l-4 border-[#FFC107]/30'
                    }`}
                  >
                    <EventCardNew
                      event={event}
                      onEdit={() => {
                        setEventToEdit(event);
                        setIsCreateModalOpen(true);
                      }}
                    />
                  
                  <div className="border-t border-gray-200 pt-4">
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Event ID:</strong> {event.id}</p>
                      <p><strong>Created by:</strong> {userNames[event.createdBy || ''] || 'Unknown User'}</p>
                      <p><strong>Attendees:</strong> {event.attendingCount || 0} / {event.maxAttendees || 'No limit'}</p>
                      {event.maxAttendees && (
                        <p><strong>Status:</strong> 
                          {(event.attendingCount || 0) >= event.maxAttendees ? 
                            <span className="text-red-600 font-medium"> Full</span> : 
                            <span className="text-green-600"> Available ({event.maxAttendees - (event.attendingCount || 0)} spots left)</span>
                          }
                          {/* Waitlist indicator - will show actual count when integrated */}
                          {(event.attendingCount || 0) >= event.maxAttendees && (
                            <span className="text-purple-600"> • Waitlist enabled</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => shareEvent(event)}
                        className="px-3 py-1 bg-[#F25129] text-white rounded hover:bg-[#E0451F] text-sm"
                      >
                        Share Event
                      </button>
                    </div>
                  </div>
                </div>
                ));
              })()}
              
              {/* Event Pagination - Always show when there are events */}
              {allEvents.length > 0 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  {allEvents.length > PAGE_SIZE ? (
                    <>
                      <button
                        onClick={() => setEventsPage(Math.max(0, eventsPage - 1))}
                        disabled={eventsPage === 0}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-4 py-2 text-gray-600">
                        Page {eventsPage + 1} of {Math.ceil(allEvents.length / PAGE_SIZE)}
                      </span>
                      <button
                        onClick={() => setEventsPage(Math.min(Math.ceil(allEvents.length / PAGE_SIZE) - 1, eventsPage + 1))}
                        disabled={eventsPage >= Math.ceil(allEvents.length / PAGE_SIZE) - 1}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </>
                  ) : (
                    <span className="px-4 py-2 text-gray-600 text-sm">
                      Showing all {allEvents.length} event{allEvents.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-yellow-600">⚠️</span>
              <div className="text-sm text-yellow-800">
                <p className="font-medium">User Blocking Guidelines:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• Block users who repeatedly abuse RSVP system</li>
                  <li>• Block users who make last-minute cancellations</li>
                  <li>• Block users who violate community guidelines</li>
                  <li>• Blocked users cannot RSVP to any events</li>
                  <li>• Blocking can be reversed by admins</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {activeAdminSection === 'bulkAttendance' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-800">
            Bulk add members to sold-out events, manage waitlists, and reconcile headcounts without leaving the profile.
          </div>
          <BulkAttendeesPanel />
        </div>
      )}

      {activeAdminSection === 'workouts' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-700">
            Upload exercise loops, posters, and manage library access for trainers directly from here.
          </div>
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-sm text-gray-500">
                <Loader2 className="mb-3 h-6 w-6 animate-spin text-[#F25129]" />
                Loading workout library tools…
              </div>
            }
          >
            <ExercisesAdminLazy />
          </Suspense>
        </div>
      )}

      {/* Contact Messages Section */}
      {activeAdminSection === 'messages' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Contact Messages</h2>
            <div className="text-sm text-gray-500">
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-orange-100 text-orange-800">
                📧 Email notifications sent automatically
              </span>
            </div>
          </div>
          <ContactMessagesAdmin />
        </div>
      )}

      {/* User Management Section */}
      {activeAdminSection === 'users' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Management</h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
              <button
                onClick={handleSearchUsers}
                disabled={isSearching}
                className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] disabled:opacity-50"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">Search Results:</h3>
                {searchResults.map((user) => {
                  const requireApproval = user.moderationSettings?.requireApproval || false;
                  const isUpdating = updatingModerationSettings === user.id;
                  
                  return (
                    <div key={user.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium">{user.displayName}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                        </div>
                        <div className="flex gap-2">
                          {user.blockedFromRsvp ? (
                            <button
                              onClick={() => handleUnblockUser(user.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlockUser(user.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                            >
                              Block
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Moderation Settings */}
                      <div className="pt-3 border-t border-gray-300">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={requireApproval}
                            onChange={async (e) => {
                              setUpdatingModerationSettings(user.id);
                              try {
                                await ModerationService.updateUserModerationSettings(user.id, {
                                  requireApprovalForUser: e.target.checked,
                                });
                                // Update local state
                                setSearchResults(prev => prev.map(u => 
                                  u.id === user.id 
                                    ? { ...u, moderationSettings: { ...u.moderationSettings, requireApproval: e.target.checked } }
                                    : u
                                ));
                              } catch (error) {
                                console.error('Failed to update moderation settings:', error);
                              } finally {
                                setUpdatingModerationSettings(null);
                              }
                            }}
                            disabled={isUpdating}
                            className="w-4 h-4 text-[#F25129] rounded focus:ring-[#F25129]"
                          />
                          <span className="text-sm text-gray-700">
                            {isUpdating ? 'Updating...' : 'Require approval for all content'}
                          </span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-6">
                          When enabled, all posts and media from this user will require admin approval before being published.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {loadingBlockedUsers ? (
              <div className="text-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-gray-500 text-sm">Loading blocked users...</p>
              </div>
            ) : blockedUsers.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">Blocked Users:</h3>
                {blockedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                      <p className="text-xs text-gray-500">
                        Blocked: {user.blockedAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                      </p>
                    </div>
                    <button
                      onClick={() => unblockUser(user.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">No blocked users found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Media Management Section */}
      {activeAdminSection === 'media' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Media Management</h2>
          
          {loadingMedia ? (
            <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-gray-500">Loading media files...</p>
            </div>
          ) : allMedia.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Video className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No media files found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {allMedia.slice(mediaPage * MEDIA_PAGE_SIZE, (mediaPage + 1) * MEDIA_PAGE_SIZE).map((media) => {
                  const isExpanded = expandedMediaId === media.id;
                  const isUpdating = updatingStatus === media.id;
                  const bgProcessingStatus = media.backgroundProcessingStatus;
                  const qualityLevels = media.qualityLevels || [];
                  const failedQualities = media.failedQualities || [];
                  const bgSummary = media.backgroundProcessingSummary;
                  
                  // Get thumbnail URL - prefer thumbnailUrl, fallback to url for images
                  const thumbnailUrl = media.thumbnailUrl || (media.type === 'image' ? media.url : null);
                  
                  return (
                    <div key={media.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4">
                        {/* Thumbnail - Always visible */}
                        <div className="flex-shrink-0">
                          {thumbnailUrl ? (
                            <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                              {media.type === 'video' ? (
                                <>
                                  <img 
                                    src={thumbnailUrl} 
                                    alt="Video thumbnail" 
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                                    <Video className="w-6 h-6 text-white" />
                                  </div>
                                </>
                              ) : (
                                <img 
                                  src={thumbnailUrl} 
                                  alt="Image thumbnail" 
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          ) : (
                            <div className="w-24 h-24 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                              {media.type === 'video' ? (
                                <Video className="w-8 h-8 text-gray-400" />
                              ) : (
                                <Image className="w-8 h-8 text-gray-400" />
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Media Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-1">
                              {media.type === 'video' ? (
                                <Video className="w-4 h-4 text-[#F25129]" />
                              ) : (
                                <Image className="w-4 h-4 text-green-500" />
                              )}
                              <span className="text-sm font-medium capitalize">{media.type}</span>
                              <span className="text-xs text-gray-500">ID: {media.id.substring(0, 8)}...</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setExpandedMediaId(isExpanded ? null : media.id)}
                                className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                                title={isExpanded ? "Hide details" : "Show details"}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDeleteMedia(media.id, media)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                title="Delete media"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="text-sm text-gray-600 space-y-1">
                            <div className="flex items-center gap-2">
                              <strong>Status:</strong>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                media.transcodeStatus === 'ready' ? 'bg-green-100 text-green-800' :
                                media.transcodeStatus === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                                media.transcodeStatus === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {media.transcodeStatus || 'pending'}
                              </span>
                              {media.transcodeStatus === 'ready' && media.sources?.hls && (
                                <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">HLS Ready</span>
                              )}
                            </div>
                            <p><strong>Uploaded by:</strong> {userNames[media.uploadedBy] || 'Unknown'}</p>
                            <p><strong>Created:</strong> {media.createdAt?.toLocaleDateString() || 'Unknown'}</p>
                            {media.fileSize && (
                              <p><strong>Size:</strong> {(media.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                            )}
                            {media.transcodingMessage && (
                              <p className="text-xs text-gray-500 italic">{media.transcodingMessage}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                          {/* Video Quality Status */}
                          {media.type === 'video' && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm text-gray-700">Video Processing Status</h4>
                              
                              {/* Quality Levels */}
                              {qualityLevels.length > 0 && (
                                <div>
                                  <p className="text-xs text-gray-600 mb-1"><strong>Completed Qualities:</strong></p>
                                  <div className="flex flex-wrap gap-2">
                                    {qualityLevels.map((q: any, idx: number) => (
                                      <span key={idx} className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                        {q.label || q.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Background Processing Status */}
                              {bgProcessingStatus && (
                                <div className="bg-gray-50 p-3 rounded">
                                  <p className="text-xs font-semibold text-gray-700 mb-2">Background Processing:</p>
                                  <div className="space-y-1 text-xs">
                                    <p>
                                      <strong>Status:</strong> 
                                      <span className={`ml-1 px-2 py-0.5 rounded ${
                                        bgProcessingStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                        bgProcessingStatus === 'completed_with_failures' ? 'bg-orange-100 text-orange-800' :
                                        bgProcessingStatus === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                                        bgProcessingStatus === 'failed' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {bgProcessingStatus}
                                      </span>
                                    </p>
                                    {bgSummary && (
                                      <p>
                                        <strong>Summary:</strong> {bgSummary.succeeded || 0} succeeded, {bgSummary.failed || 0} failed out of {bgSummary.totalExpected || 0} expected
                                      </p>
                                    )}
                                    {media.backgroundProcessingTargetQualities && (
                                      <p>
                                        <strong>Target Qualities:</strong> {media.backgroundProcessingTargetQualities.join(', ')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Failed Qualities */}
                              {failedQualities.length > 0 && (
                                <div className="bg-red-50 p-3 rounded">
                                  <p className="text-xs font-semibold text-red-700 mb-2">Failed Qualities:</p>
                                  <div className="space-y-1">
                                    {failedQualities.map((fq: any, idx: number) => (
                                      <div key={idx} className="text-xs text-red-600">
                                        <strong>{fq.label || fq.name}:</strong> {fq.error || 'Unknown error'}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* HLS Sources */}
                              {media.sources && (
                                <div>
                                  <p className="text-xs text-gray-600 mb-1"><strong>HLS Sources:</strong></p>
                                  <div className="text-xs text-gray-500 space-y-1">
                                    {media.sources.hlsMaster && (
                                      <p className="truncate">Master: {media.sources.hlsMaster}</p>
                                    )}
                                    {media.sources.hls && (
                                      <p className="truncate">Fallback: {media.sources.hls}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Manual Status Update */}
                          <div className="pt-3 border-t border-gray-200">
                            <p className="text-xs font-semibold text-gray-700 mb-2">Manual Status Update:</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleUpdateMediaStatus(media.id, 'processing')}
                                disabled={isUpdating || media.transcodeStatus === 'processing'}
                                className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded text-xs hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {isUpdating && media.transcodeStatus === 'processing' ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                Reset to Processing
                              </button>
                              <button
                                onClick={() => handleUpdateMediaStatus(media.id, 'ready')}
                                disabled={isUpdating || media.transcodeStatus === 'ready'}
                                className="px-3 py-1.5 bg-green-100 text-green-800 rounded text-xs hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {isUpdating && media.transcodeStatus === 'ready' ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                Mark as Ready
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt('Enter failure reason (optional):');
                                  if (reason !== null) {
                                    handleUpdateMediaStatus(media.id, 'failed', reason || 'Manually marked as failed');
                                  }
                                }}
                                disabled={isUpdating || media.transcodeStatus === 'failed'}
                                className="px-3 py-1.5 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {isUpdating && media.transcodeStatus === 'failed' ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                Mark as Failed
                              </button>
                            </div>
                          </div>

                          {/* Additional Metadata */}
                          <div className="pt-3 border-t border-gray-200">
                            <p className="text-xs font-semibold text-gray-700 mb-2">Metadata:</p>
                            <div className="text-xs text-gray-500 space-y-1">
                              {media.filePath && <p><strong>File Path:</strong> {media.filePath}</p>}
                              {media.thumbnailPath && <p><strong>Thumbnail:</strong> {media.thumbnailPath}</p>}
                              {media.duration && <p><strong>Duration:</strong> {media.duration}s</p>}
                              {media.dimensions && <p><strong>Resolution:</strong> {media.dimensions.width}x{media.dimensions.height}</p>}
                              {media.transcodeError && (
                                <p className="text-red-600"><strong>Error:</strong> {media.transcodeError}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Pagination */}
              {allMedia.length > MEDIA_PAGE_SIZE && (
                <div className="flex justify-center gap-2 mt-6">
                  <button
                    onClick={() => setMediaPage(Math.max(0, mediaPage - 1))}
                    disabled={mediaPage === 0}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-600">
                    Page {mediaPage + 1} of {Math.ceil(allMedia.length / MEDIA_PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setMediaPage(Math.min(Math.ceil(allMedia.length / MEDIA_PAGE_SIZE) - 1, mediaPage + 1))}
                    disabled={mediaPage >= Math.ceil(allMedia.length / MEDIA_PAGE_SIZE) - 1}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* System Maintenance Section */}
      {activeAdminSection === 'maintenance' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Maintenance</h2>
          <div className="space-y-4">
            <CleanupToolPanel />
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">FFmpeg Pipeline Fix</h4>
              <p className="text-sm text-yellow-700 mb-3">
                If videos are stuck in "processing" state, this will reset them to the correct status.
              </p>
              <button
                onClick={handleFixStuckProcessing}
                disabled={isFixingStuckProcessing}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {isFixingStuckProcessing ? 'Fixing...' : 'Fix Stuck Processing Videos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Testimonials Moderation Section */}
      {activeAdminSection === 'testimonials' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Testimonials Management</h2>
            
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setTestimonialTab('moderation')}
                className={`px-4 py-2 font-medium text-sm transition ${
                  testimonialTab === 'moderation'
                    ? 'border-b-2 border-[#F25129] text-[#F25129]'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Moderation
              </button>
              <button
                type="button"
                onClick={() => setTestimonialTab('ai-prompts')}
                className={`px-4 py-2 font-medium text-sm transition ${
                  testimonialTab === 'ai-prompts'
                    ? 'border-b-2 border-[#F25129] text-[#F25129]'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                AI Prompts Configuration
              </button>
            </div>

            {/* Moderation Tab */}
            {testimonialTab === 'moderation' && (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Review and manage stories shared by the moms community. Publish to show on the homepage carousel.
                </p>
                
                {/* Status Filters */}
                <div className="flex flex-wrap gap-2">
              {(['pending', 'published', 'rejected', 'all'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatusFilter(status === 'all' ? 'all' : status)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selectedStatusFilter === status
                      ? 'bg-[#F25129] text-white shadow'
                      : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {status === 'all'
                    ? 'All'
                    : statusLabels[status].label}
                </button>
              ))}
                </div>

                {loadingTestimonials && (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-6 text-[#F25129]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading testimonials…
                  </div>
                )}

                {testimonialsError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
                    Failed to load testimonials. Please refresh the page.
                  </div>
                )}

                {!loadingTestimonials && !testimonialsError && filteredTestimonials.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-6 text-center text-gray-600">
                    No testimonials found for this filter.
                  </div>
                )}

                {!loadingTestimonials && !testimonialsError && filteredTestimonials.length > 0 && (
                  <div className="space-y-4">
                    {filteredTestimonials.map((testimonial) => {
                      const statusMeta = statusLabels[testimonial.status];
                      return (
                        <article
                          key={testimonial.id}
                          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                        >
                          <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 text-[#FFC107] mb-1">
                                {Array.from({ length: Math.round(testimonial.rating || 0) }).map((_, index) => (
                                  <Star key={index} className="h-4 w-4 fill-current" />
                                ))}
                              </div>
                              <h3 className="text-lg font-semibold text-gray-900">{testimonial.displayName}</h3>
                              {testimonial.highlight && (
                                <p className="text-sm text-[#F25129] mt-1">{testimonial.highlight}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusMeta.className}`}>
                                {statusMeta.label}
                              </span>
                              {testimonial.featured && (
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                                  Featured
                                </span>
                              )}
                            </div>
                          </header>

                          <p className="text-gray-700 mb-4">"{testimonial.quote}"</p>

                          <footer className="flex flex-col gap-3 border-t border-dashed border-gray-200 pt-4 md:flex-row md:items-center md:justify-between">
                            <div className="text-xs text-gray-500">
                              <span>Submitted: {testimonial.createdAt.toLocaleDateString()}</span>
                              {testimonial.updatedAt && <span className="ml-3">Updated: {testimonial.updatedAt.toLocaleDateString()}</span>}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {testimonial.status !== 'published' && (
                                <button
                                  type="button"
                                  onClick={() => handleTestimonialStatusChange(testimonial, 'published')}
                                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                                >
                                  <CheckCircle className="h-4 w-4" /> Publish
                                </button>
                              )}

                              {testimonial.status === 'published' && (
                                <button
                                  type="button"
                                  onClick={() => handleTestimonialStatusChange(testimonial, 'pending')}
                                  className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-200"
                                >
                                  <Eye className="h-4 w-4" /> Unpublish
                                </button>
                              )}

                              {testimonial.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() => handleTestimonialStatusChange(testimonial, 'rejected')}
                                  className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-200"
                                >
                                  <XCircle className="h-4 w-4" /> Reject
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleToggleFeatured(testimonial)}
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                                  testimonial.featured
                                    ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                <Star className="h-4 w-4" /> {testimonial.featured ? 'Unfeature' : 'Feature'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteTestimonial(testimonial)}
                                className="inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-200"
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </button>
                            </div>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* AI Prompts Tab */}
          {testimonialTab === 'ai-prompts' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>How this works:</strong> Configure the AI prompts that help users write testimonials. These prompts provide context about the community and guide the AI to generate authentic, relevant suggestions. Changes take effect immediately for new testimonial generations.
                </p>
              </div>

              {loadingPrompts ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-6 text-[#F25129]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading prompts...
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); saveAIPrompts(); }} className="space-y-6">
                  {/* Community Context */}
                  <div>
                    <label htmlFor="communityContext" className="block text-sm font-medium text-gray-700 mb-2">
                      Community Context *
                    </label>
                    <textarea
                      id="communityContext"
                      required
                      rows={6}
                      value={aiPrompts.communityContext}
                      onChange={(e) => setAiPrompts(prev => ({ ...prev, communityContext: e.target.value }))}
                      placeholder="Describe what Moms Fitness Mojo is, what activities you offer, your values, etc. This helps AI understand the community context."
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                    />
                    <p className="mt-1 text-xs text-gray-500">This context is provided to the AI so it understands your community.</p>
                  </div>

                  {/* Guidelines */}
                  <div>
                    <label htmlFor="guidelines" className="block text-sm font-medium text-gray-700 mb-2">
                      Guidelines *
                    </label>
                    <textarea
                      id="guidelines"
                      required
                      rows={8}
                      value={aiPrompts.guidelines}
                      onChange={(e) => setAiPrompts(prev => ({ ...prev, guidelines: e.target.value }))}
                      placeholder="Enter guidelines, one per line. Example:&#10;- Be authentic and heartfelt&#10;- Mention specific experiences&#10;- Keep it concise"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-mono focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                    />
                    <p className="mt-1 text-xs text-gray-500">One guideline per line. These guide how the AI generates testimonials.</p>
                  </div>

                  {/* Example Activities */}
                  <div>
                    <label htmlFor="exampleActivities" className="block text-sm font-medium text-gray-700 mb-2">
                      Example Activities
                    </label>
                    <input
                      id="exampleActivities"
                      type="text"
                      value={aiPrompts.exampleActivities.join(', ')}
                      onChange={(e) => setAiPrompts(prev => ({ ...prev, exampleActivities: e.target.value.split(',').map(a => a.trim()).filter(a => a) }))}
                      placeholder="e.g., Saturday morning walks, yoga sessions, hiking trails, tennis matches"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                    />
                    <p className="mt-1 text-xs text-gray-500">Comma-separated list. AI may mention these when relevant.</p>
                  </div>

                  {/* Example Events */}
                  <div>
                    <label htmlFor="exampleEvents" className="block text-sm font-medium text-gray-700 mb-2">
                      Example Events
                    </label>
                    <input
                      id="exampleEvents"
                      type="text"
                      value={aiPrompts.exampleEvents.join(', ')}
                      onChange={(e) => setAiPrompts(prev => ({ ...prev, exampleEvents: e.target.value.split(',').map(e => e.trim()).filter(e => e) }))}
                      placeholder="e.g., community hikes, fitness workshops, social brunches, dance sessions"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                    />
                    <p className="mt-1 text-xs text-gray-500">Comma-separated list. AI may mention these when relevant.</p>
                  </div>

                  {/* Tone */}
                  <div>
                    <label htmlFor="tone" className="block text-sm font-medium text-gray-700 mb-2">
                      Tone
                    </label>
                    <input
                      id="tone"
                      type="text"
                      value={aiPrompts.tone}
                      onChange={(e) => setAiPrompts(prev => ({ ...prev, tone: e.target.value }))}
                      placeholder="e.g., warm, supportive, empowering, authentic"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                    />
                    <p className="mt-1 text-xs text-gray-500">Describe the desired tone for generated testimonials.</p>
                  </div>

                  {/* Last Updated */}
                  {aiPrompts.updatedAt && (
                    <div className="text-xs text-gray-500">
                      Last updated: {aiPrompts.updatedAt.toLocaleString()}
                      {aiPrompts.updatedBy && ` by ${aiPrompts.updatedBy}`}
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      type="submit"
                      disabled={savingPrompts || !aiPrompts.communityContext.trim() || !aiPrompts.guidelines.trim()}
                      className="inline-flex items-center gap-2 rounded-full bg-[#F25129] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#E0451F] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingPrompts ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save AI Prompts'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Posts - AI Prompts Configuration */}
      {activeAdminSection === 'posts' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Posts - AI Prompts Configuration</h2>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              Configure the AI prompts that help users write community posts. These prompts guide the AI to generate engaging, on-brand content. Changes take effect immediately for new generations.
            </p>
          </div>

          {loadingPostPrompts ? (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-6 text-[#F25129]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading prompts...
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); savePostAIPrompts(); }} className="space-y-6">
              {/* Community Context */}
              <div>
                <label htmlFor="postCommunityContext" className="block text-sm font-medium text-gray-700 mb-2">
                  Community Context *
                </label>
                <textarea
                  id="postCommunityContext"
                  required
                  rows={6}
                  value={postAiPrompts.communityContext}
                  onChange={(e) => setPostAiPrompts(prev => ({ ...prev, communityContext: e.target.value }))}
                  placeholder="Describe the community context for posts..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                />
                <p className="mt-1 text-xs text-gray-500">This context is provided to the AI so it understands your community.</p>
              </div>

              {/* Guidelines */}
              <div>
                <label htmlFor="postGuidelines" className="block text-sm font-medium text-gray-700 mb-2">
                  Guidelines *
                </label>
                <textarea
                  id="postGuidelines"
                  required
                  rows={8}
                  value={postAiPrompts.guidelines}
                  onChange={(e) => setPostAiPrompts(prev => ({ ...prev, guidelines: e.target.value }))}
                  placeholder="Enter guidelines, one per line."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-mono focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                />
                <p className="mt-1 text-xs text-gray-500">One guideline per line. These guide how the AI generates posts.</p>
              </div>

              {/* Example Topics */}
              <div>
                <label htmlFor="exampleTopics" className="block text-sm font-medium text-gray-700 mb-2">
                  Example Topics
                </label>
                <input
                  id="exampleTopics"
                  type="text"
                  value={postAiPrompts.exampleTopics.join(', ')}
                  onChange={(e) => setPostAiPrompts(prev => ({ ...prev, exampleTopics: e.target.value.split(',').map(t => t.trim()).filter(t => t) }))}
                  placeholder="e.g., fitness progress, motivation, community events"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                />
                <p className="mt-1 text-xs text-gray-500">Comma-separated list. AI may mention these when relevant.</p>
              </div>

              {/* Example Post Types */}
              <div>
                <label htmlFor="examplePostTypes" className="block text-sm font-medium text-gray-700 mb-2">
                  Example Post Types
                </label>
                <input
                  id="examplePostTypes"
                  type="text"
                  value={postAiPrompts.examplePostTypes.join(', ')}
                  onChange={(e) => setPostAiPrompts(prev => ({ ...prev, examplePostTypes: e.target.value.split(',').map(t => t.trim()).filter(t => t) }))}
                  placeholder="e.g., progress update, question, motivational, event share"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                />
                <p className="mt-1 text-xs text-gray-500">Comma-separated list. AI may use these as inspiration.</p>
              </div>

              {/* Tone */}
              <div>
                <label htmlFor="postTone" className="block text-sm font-medium text-gray-700 mb-2">
                  Tone
                </label>
                <input
                  id="postTone"
                  type="text"
                  value={postAiPrompts.tone}
                  onChange={(e) => setPostAiPrompts(prev => ({ ...prev, tone: e.target.value }))}
                  placeholder="e.g., warm, encouraging, authentic, community-focused"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
                />
                <p className="mt-1 text-xs text-gray-500">Describe the desired tone for generated posts.</p>
              </div>

              {/* Last Updated */}
              {postAiPrompts.updatedAt && (
                <div className="text-xs text-gray-500">
                  Last updated: {postAiPrompts.updatedAt.toLocaleString()}
                  {postAiPrompts.updatedBy && ` by ${postAiPrompts.updatedBy}`}
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={savingPostPrompts || !postAiPrompts.communityContext.trim() || !postAiPrompts.guidelines.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#F25129] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#E0451F] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingPostPrompts ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Post AI Prompts'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Account Approvals Section */}
      {activeAdminSection === 'accountApprovals' && (
        <AccountApprovalsAdmin />
      )}

      {/* Assistant Configuration Section */}
      {activeAdminSection === 'assistantConfig' && (
        <AssistantConfigPanel />
      )}

      {/* KB Gaps Section */}
      {activeAdminSection === 'kbGaps' && (
        <KBGapsPanel />
      )}

      {/* Content Moderation Section */}
      {activeAdminSection === 'moderation' && (
        <ContentModerationPanel />
      )}

      {/* Trusted Users Section */}
      {activeAdminSection === 'trustedUsers' && (
        <TrustedUsersPanel />
      )}

      {/* Support Tool Categories Section */}
      {activeAdminSection === 'supportToolCategories' && (
        <SupportToolCategoriesPanel />
      )}
    </div>
  );
};

export default ProfileAdminTab;