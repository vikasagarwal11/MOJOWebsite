import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Heart, MessageCircle, Tag, Play, /* Download, */ MoreHorizontal, EyeOff, Eye, Trash2, Check } from 'lucide-react';
import { safeFormat, safeToDate } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, updateDoc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { useViewCounter } from '../../hooks/useViewCounter';
import { usePagedComments } from '../../hooks/usePagedComments';
import { attachHls, detachHls } from '../../utils/hls';
import { getDownloadURL, ref, deleteObject } from 'firebase/storage';
import { storage } from '../../config/firebase';
import toast from 'react-hot-toast';
import ConfirmDialog from '../ConfirmDialog';
import { useImageOrientation } from '../../utils/imageOrientation';
import { getThumbnailUrl } from '../../utils/thumbnailUtils';
// Download feature temporarily disabled - uncomment to re-enable
// import { requestWatermarkedDownload } from '../../services/mediaDownloadService';
import { isUserApproved } from '../../utils/userUtils';

export default function MediaCard({ 
  media, 
  onOpen,
  selectionMode = false,
  selected = false,
  onToggleSelect
}: {
  media: any;
  onOpen?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (mediaId: string) => void;
}) {
  const { currentUser } = useAuth();
  const canEngage = !!currentUser && (currentUser.role === 'member' || currentUser.role === 'admin');
  const { correctImageOrientation } = useImageOrientation();

  const [liked, setLiked] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(media.likesCount ?? 0);

  // Check user's initial like state on mount
  useEffect(() => {
    if (currentUser && media.id) {
      const likeRef = doc(db, 'media', media.id, 'likes', currentUser.id);
      getDoc(likeRef).then((docSnapshot: any) => {
        setLiked(docSnapshot.exists());
      }).catch((error: any) => {
        console.warn('Failed to check initial like state:', error);
      });
    }
  }, [currentUser, media.id]);
  const [newComment, setNewComment] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => 
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );
  // Download feature temporarily disabled - uncomment to re-enable
  // const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen && !(event.target as Element).closest('.admin-menu')) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [isHlsAttached, setIsHlsAttached] = useState(false);
  const [isThumbnailLoading, setIsThumbnailLoading] = useState(true);
  const [localMedia, setLocalMedia] = useState(media); // Local copy for real-time sync
  
  // Keep localMedia in sync when this card points at a new doc
  useEffect(() => {
    setLocalMedia(media);
  }, [media.id]); // important: key on id only
  
  // Real-time sync for main media document data (transcodeStatus, sources.hls, etc.)
  useEffect(() => {
    if (!media.id) return;
    
    const unsubscribe = onSnapshot(
      doc(db, 'media', media.id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const serverData = docSnapshot.data();
          
          setLocalMedia((prev: any) => {
            return {
              ...prev,
              ...serverData
            };
          });
        }
      },
      (error: any) => {
        console.warn('🔄 [DEBUG] Real-time sync error:', error);
      }
    );
    
    return unsubscribe;
  }, [media.id, media.transcodeStatus]);
  
  // Load thumbnail URL - wait for Firestore flags (no more 404s!)
  useEffect(() => {
    setIsThumbnailLoading(true);
    
    // For images: Wait for Firestore thumbnail flags (no polling, no 404s!)
    if (localMedia.type === 'image' && localMedia.url) {
      // Check if medium thumbnail is ready (preferred size for cards)
      if (localMedia.thumbnails?.mediumReady && localMedia.thumbnails?.mediumPath) {
        getDownloadURL(ref(storage, localMedia.thumbnails.mediumPath))
          .then(url => {
            setThumbnailUrl(url);
            setIsThumbnailLoading(false);
          })
          .catch(error => {
            console.warn('🖼️ Error loading medium thumbnail, falling back:', error);
            setThumbnailUrl(localMedia.url);
            setIsThumbnailLoading(false);
          });
      }
      // Check if small thumbnail is ready (fallback)
      else if (localMedia.thumbnails?.smallReady && localMedia.thumbnails?.smallPath) {
        getDownloadURL(ref(storage, localMedia.thumbnails.smallPath))
          .then(url => {
            setThumbnailUrl(url);
            setIsThumbnailLoading(false);
          })
          .catch(error => {
            console.warn('🖼️ Error loading small thumbnail, falling back:', error);
            setThumbnailUrl(localMedia.url);
            setIsThumbnailLoading(false);
          });
      }
      // Check if large thumbnail is ready (fallback)
      else if (localMedia.thumbnails?.largeReady && localMedia.thumbnails?.largePath) {
        getDownloadURL(ref(storage, localMedia.thumbnails.largePath))
          .then(url => {
            setThumbnailUrl(url);
            setIsThumbnailLoading(false);
          })
          .catch(error => {
            console.warn('🖼️ Error loading large thumbnail, falling back:', error);
            setThumbnailUrl(localMedia.url);
            setIsThumbnailLoading(false);
          });
      }
      // No thumbnails ready yet - use original (will update when thumbnail is ready via real-time listener)
      else {
        setThumbnailUrl(localMedia.url);
        setIsThumbnailLoading(false);
      }
    } else {
      // For videos or images without filePath: Use existing logic
      if (localMedia.thumbnailPath) {
        getDownloadURL(ref(storage, localMedia.thumbnailPath))
          .then(url => {
            setThumbnailUrl(url);
            setIsThumbnailLoading(false);
          })
          .catch(error => {
            console.warn('🖼️ Failed to load thumbnail, using original URL:', error);
            setThumbnailUrl(localMedia.url);
            setIsThumbnailLoading(false);
          });
      } else {
        setThumbnailUrl(localMedia.url);
        setIsThumbnailLoading(false);
      }
    }
  }, [localMedia.thumbnailPath, localMedia.url, localMedia.filePath, localMedia.type, localMedia.thumbnails]);

  // Enhanced debugging for video playback issues (reduced logging)
  useEffect(() => {
    // console.log('🎬 MediaCard Debug:', {
    //   mediaId: localMedia.id,
    //   type: localMedia.type,
    //   transcodeStatus: localMedia.transcodeStatus,
    //   hasHls: !!localMedia.sources?.hls,
    //   hlsPath: localMedia.sources?.hls,
    //   hasThumbnail: !!localMedia.thumbnailPath,
    //   thumbnailPath: localMedia.thumbnailPath,
    //   videoUrl: localMedia.url,
    //   isHlsAttached,
    //   videoRefExists: !!videoRef.current
    // });
  }, [localMedia.id, localMedia.type, localMedia.transcodeStatus, localMedia.sources?.hls, localMedia.thumbnailPath, localMedia.url, isHlsAttached]);

  // Attach HLS when video element is ready and HLS source is available
  useEffect(() => {
    // Skip HLS in development due to CORS issues
    if (import.meta.env.DEV) {
      console.log('🔧 Development mode: HLS disabled due to CORS');
      if (videoRef.current && !isHlsAttached) {
        console.log('📹 Setting video source for development:', localMedia.url);
        videoRef.current.src = localMedia.url;
      }
      return;
    }

    // Prefer master playlist for adaptive streaming, fallback to single manifest
    const hlsPath = localMedia.sources?.hlsMaster || localMedia.sources?.hls;
    const isMasterPlaylist = !!localMedia.sources?.hlsMaster;
    
    console.log('🔧 HLS Attachment Logic:', {
      hasVideoRef: !!videoRef.current,
      hasHlsMaster: !!localMedia.sources?.hlsMaster,
      hasHlsSource: !!localMedia.sources?.hls,
      hlsPath: hlsPath,
      isMasterPlaylist: isMasterPlaylist,
      isAlreadyAttached: isHlsAttached,
      videoUrl: localMedia.url
    });
    
    if (videoRef.current && hlsPath && !isHlsAttached) {
      console.log(`✅ Attempting to attach HLS ${isMasterPlaylist ? '(adaptive streaming)' : '(single quality)'}:`, hlsPath);
      // HLS is ready - upgrade to HLS streaming (prefer master playlist for adaptive streaming)
      attachHls(videoRef.current, hlsPath, isMasterPlaylist)
        .then(() => {
          console.log('✅ HLS attached successfully');
          setIsHlsAttached(true);
        })
        .catch(error => {
          // Check if it's a 404 (object not found) - common for old videos
          const is404 = error?.code === 'storage/object-not-found' || 
                       error?.message?.includes('does not exist') ||
                       error?.message?.includes('404');
          
          if (is404) {
            console.warn('⚠️ HLS file not found (404) - likely an old video. Original video will be used.');
            // Don't set src - the <source> tag already has the original URL
            return;
          }
          
          console.error('❌ Failed to attach HLS, using fallback:', error);
          // Fallback to original video URL only if not a 404
          if (videoRef.current) {
            console.log('🔄 Setting fallback video source:', localMedia.url);
            videoRef.current.src = localMedia.url;
          }
        });
    } else if (videoRef.current && !isHlsAttached && !hlsPath) {
      console.log('⚠️ No HLS source available, using original video URL:', localMedia.url);
      // No HLS yet - show original file immediately for instant playback
      videoRef.current.src = localMedia.url;
    } else {
      console.log('⏸️ HLS attachment conditions not met:', {
        hasVideoRef: !!videoRef.current,
        hasHlsSource: !!localMedia.sources?.hls,
        isAlreadyAttached: isHlsAttached
      });
    }
  }, [localMedia.sources?.hlsMaster, localMedia.sources?.hls, localMedia.url, isHlsAttached]);

  // Enhanced poster image handling - show poster immediately when available
  useEffect(() => {
    if (localMedia.thumbnailPath && localMedia.type === 'video') {
      // For videos, show poster image immediately if available
      getDownloadURL(ref(storage, localMedia.thumbnailPath))
        .then(url => {
          setThumbnailUrl(url);
          setIsThumbnailLoading(false);
        })
        .catch(error => {
          console.warn('Failed to load poster image:', error);
          setThumbnailUrl(localMedia.url); // Fallback to original
          setIsThumbnailLoading(false);
        });
    }
  }, [localMedia.thumbnailPath, localMedia.type, localMedia.url]);

  // Cleanup HLS when component unmounts or media changes
  useEffect(() => {
    return () => {
      if (videoRef.current && isHlsAttached) {
        detachHls(videoRef.current);
        setIsHlsAttached(false);
      }
    };
  }, [isHlsAttached]);
  useViewCounter(localMedia.id, videoRef.current ?? null);

  // Like toggle (optimistic) - Cloud Functions handle counter updates
  const handleLikeToggle = async () => {
    if (!canEngage || !currentUser) { 
      toast.error('Only members can like.'); 
      return; 
    }
    if (!isUserApproved(currentUser)) {
      toast.error('Your account is pending approval. You can browse media but cannot like yet.');
      return;
    }
    
    const likeRef = doc(db, 'media', localMedia.id, 'likes', currentUser.id);
    
    try {
      if (liked) {
        setLiked(false); 
        setLikesCount(c => Math.max(0, c - 1));
        await deleteDoc(likeRef);
        // Note: likesCount will be updated by Cloud Function
      } else {
        setLiked(true); 
        setLikesCount(c => c + 1);
        await setDoc(likeRef, { 
          userId: currentUser.id, 
          createdAt: serverTimestamp() 
        });
        // Note: likesCount will be updated by Cloud Function
      }
    } catch (e: any) {
      // Revert optimistic updates on error
      setLiked(v => !v); 
      setLikesCount(c => c + (liked ? 1 : -1));
      toast.error(e?.message || 'Failed to update like');
    }
  };

  // Download feature temporarily disabled - uncomment to re-enable
  /*
  const handleDownloadMedia = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isDownloading) return;
    
    try {
      setIsDownloading(true);
      
      // Silently prepare watermarked download (no toast messages)
      const { url } = await requestWatermarkedDownload(localMedia.id);
      
      // Build filename with _watermarked suffix
      const originalFilename = localMedia.filePath?.split('/').pop() || `${localMedia.title || 'media'}`;
      const ext = originalFilename.includes('.') ? originalFilename.substring(originalFilename.lastIndexOf('.')) : '';
      const baseName = ext ? originalFilename.substring(0, originalFilename.lastIndexOf('.')) : originalFilename;
      const filename = `${baseName}_watermarked${ext}`;
      
      if (isMobile) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error: any) {
      console.error('Failed to download watermarked media:', error);
      toast.error(error?.message || 'Failed to download media');
    } finally {
      setIsDownloading(false);
    }
  };
  */

  // Real-time sync for likes count to prevent stale data
  useEffect(() => {
    if (!localMedia.id) return;
    
    const unsubscribe = onSnapshot(
      doc(db, 'media', localMedia.id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const serverLikesCount = docSnapshot.data().likesCount ?? 0;
          // Always sync with server truth to prevent drift
          setLikesCount(serverLikesCount);
        }
      },
      (error: any) => {
        console.warn('Failed to sync likes count:', error);
      }
    );
    
    return unsubscribe;
  }, [localMedia.id]);

  const onDoubleTap = () => { if (!liked) handleLikeToggle(); };

  // Admin/owner functions
  const canModerate = !!currentUser && (currentUser.role === 'admin' || currentUser.id === localMedia.uploadedBy);

  async function togglePublic() {
    try {
      await updateDoc(doc(db, 'media', localMedia.id), { isPublic: !localMedia.isPublic });
      toast.success(localMedia.isPublic ? 'Hidden from public' : 'Now public');
    } catch (e: any) { 
      toast.error(e.message || 'Failed to update visibility'); 
    }
  }

  function onClickDelete() {
    setMenuOpen(false);
    setConfirmOpen(true);
  }

  async function actuallyDelete() {
    setConfirmOpen(false);
    try {
      console.log('🗑️ [USER] Starting deletion for media:', {
        mediaId: localMedia.id,
        filePath: localMedia.filePath,
        thumbnailPath: localMedia.thumbnailPath,
        type: localMedia.type
      });

      // Only delete from Firestore - Cloud Function will handle storage cleanup
      await deleteDoc(doc(db, 'media', localMedia.id));
      console.log('🗑️ [USER] Firestore document deleted - Cloud Function will handle storage cleanup');
      
      toast.success('Media deleted successfully');
    } catch (e: any) { 
      console.error('🗑️ [USER] Deletion failed:', e);
      toast.error(e.message || 'Failed to delete media'); 
    }
  }

  const comments = usePagedComments(localMedia.id, 10, { initialOpen: false });
  
  // Real-time comment count is now handled by usePagedComments hook
  
  // Safe date parsing with fallback - use safeToDate utility
  const createdAt = useMemo(() => {
    if (!localMedia.createdAt) return new Date();
    
    try {
      // Use the safeToDate utility for consistent date handling
      const date = safeToDate(localMedia.createdAt);
      return date || new Date();
    } catch (error) {
      console.warn('Date parsing error:', error);
      return new Date();
    }
  }, [localMedia.createdAt]);
  
  // One status object, one chip - prevents conflicting chips
  const status = useMemo(() => {
    const m = localMedia;
    if (!m) return null;

    if (m.transcodeStatus === 'failed') {
      const errorMsg = m.transcodingMessage || m.transcodeError || 'Upgrade Failed';
      return { color: 'red', label: errorMsg.length > 30 ? 'Upgrade Failed' : errorMsg };
    }

    if (m.type === 'video') {
      if (m.transcodeStatus === 'ready' && (!!m.sources?.hlsMaster || !!m.sources?.hls)) {
        const isAdaptive = !!m.sources?.hlsMaster;
        return { color: 'green', label: isAdaptive ? 'Adaptive Streaming Ready' : 'HLS Ready' };
      }
      if (m.transcodeStatus === 'processing' && !!m.thumbnailPath) {
        // Check if video has been processing for too long (more than 10 minutes)
        const processingTime = m.transcodeStartTime 
          ? (Date.now() - (m.transcodeStartTime?.toDate?.()?.getTime() || Date.now())) / 1000 / 60
          : null;
        
        if (processingTime && processingTime > 10) {
          return { color: 'orange', label: `Taking longer than expected (${Math.round(processingTime)}m)` };
        }
        
        // Show progress message if available
        if (m.transcodingMessage) {
          return { color: 'purple', label: m.transcodingMessage };
        }
        
        return { color: 'purple', label: 'Poster Ready' };
      }
      if (m.transcodeStatus === 'processing') {
        // Show progress message if available
        if (m.transcodingMessage) {
          return { color: 'blue', label: m.transcodingMessage };
        }
        return { color: 'blue', label: 'Processing…' };
      }
    }

    if (m.type === 'image') {
      if (m.transcodeStatus === 'ready' && !!m.thumbnailPath) return { color: 'green', label: 'Optimized' };
      if (m.transcodeStatus === 'processing') return { color: 'blue', label: 'Optimizing…' };
    }

    return null;
  }, [localMedia]);

  const previewEl = useMemo(() => {
    return localMedia.type === 'video' ? (
      <div className="relative" onDoubleClick={onDoubleTap} onClick={selectionMode ? undefined : onOpen}>
        {/* Show loading placeholder when no thumbnail yet and processing */}
        {localMedia.transcodeStatus === 'processing' && !localMedia.thumbnailPath && isThumbnailLoading ? (
          <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 border-4 border-[#F25129] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-gray-500 text-xs">Processing video...</div>
            </div>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              poster={thumbnailUrl && thumbnailUrl !== localMedia.url ? thumbnailUrl : undefined}
              playsInline 
              muted
              preload="metadata"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                console.warn('⚠️ Video load error, showing placeholder:', e);
              }}
            >
              {/* Original source for immediate playback while HLS processes */}
              <source src={localMedia.url} type={localMedia.type === 'video' ? 'video/mp4' : 'video/*'} />
              {/* HLS will be attached dynamically via useEffect when ready */}
            </video>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center">
                <Play className="w-6 h-6 text-[#F25129] ml-0.5" />
              </div>
            </div>
          </>
        )}
                 {/* Status labels - can be enabled/disabled for development/debugging */}
         {status && (import.meta.env.DEV || import.meta.env.VITE_SHOW_STATUS_LABELS === 'true') && (
           <div className={`absolute top-3 left-3 z-10 px-3 py-1.5 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-2
                          ${status.color === 'green' ? 'bg-green-500' :
                                    status.color === 'purple' ? 'bg-[#F25129]' :
                                    status.color === 'orange' ? 'bg-orange-500' :
        status.color === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}>
      <div className={`w-2 h-2 bg-white rounded-full ${status.color === 'blue' || status.color === 'purple' || status.color === 'orange' ? 'animate-pulse' : ''}`}></div>
             {status.label}
           </div>
         )}
      </div>
    ) : (
      isThumbnailLoading ? (
        <div className="w-full h-full bg-gray-200 animate-pulse flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      ) : (
        (() => {
          // Use original image instead of thumbnail to avoid cropping faces
          // Thumbnails are square (400x400, 800x800, 1200x1200) which crop images
          // Original images preserve full content, and object-contain shows everything
          const originalUrl = localMedia.url;
          const imageSrc = originalUrl || thumbnailUrl;
          
          return (
            <img 
              src={imageSrc}
              alt={localMedia.title} 
              loading="lazy" 
              onDoubleClick={onDoubleTap} 
              onClick={selectionMode ? undefined : onOpen}
              onLoad={(e) => {
                correctImageOrientation(e.currentTarget);
              }}
              onError={(e) => {
                const img = e.currentTarget;
                console.warn('🖼️ [DEBUG] Image load error:', {
                  mediaId: localMedia.id,
                  failedSrc: img.src,
                  currentSrc: img.currentSrc,
                });
                
                // Fallback to thumbnail if original fails
                if (img.src !== thumbnailUrl && thumbnailUrl) {
                  console.log('🖼️ [DEBUG] Falling back to thumbnail URL');
                  img.src = thumbnailUrl;
                } else {
                  console.error('🖼️ [DEBUG] Both original and thumbnail failed to load');
                }
              }}
              className="w-full h-full object-contain transition-opacity duration-300" 
            />
          );
        })()
      )
    );
  }, [localMedia, onOpen, liked, thumbnailUrl, isThumbnailLoading, status, localMedia.transcodeStatus, selectionMode]);

  // Handle card click - toggle selection in selection mode, otherwise open lightbox
  const handleCardClick = (e: React.MouseEvent) => {
    if (selectionMode && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(media.id);
    } else if (onOpen && !selectionMode) {
      onOpen();
    }
  };

  return (
    <div 
      className={`bg-white/80 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border ${
        selectionMode 
          ? selected 
            ? 'border-[#F25129] border-4' 
            : 'border-gray-300'
          : 'border-[#F25129]/20'
      } group ${selectionMode ? 'cursor-pointer' : ''}`}
      data-media-card
      onClick={handleCardClick}
    >
      <div className="relative aspect-square overflow-hidden bg-[#FFF5F2]">
        {/* Selection checkbox overlay */}
        {selectionMode && (
          <div className="absolute top-2 left-2 z-20">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              selected 
                ? 'bg-[#F25129] border-[#F25129]' 
                : 'bg-white/90 border-gray-400'
            }`}>
              {selected && <Check className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}
        {previewEl}
        <div className="absolute top-3 right-3 flex gap-2">
          {/* Download feature temporarily disabled - uncomment to re-enable */}
          {/*
          <button
            onClick={handleDownloadMedia}
            disabled={isDownloading}
            className={`p-2 rounded-full bg-white/90 hover:bg-white transition-colors ${isDownloading ? 'opacity-70 cursor-wait' : ''}`}
            title="Download"
          >
            <Download className={`w-4 h-4 ${isDownloading ? 'text-gray-400 animate-pulse' : 'text-gray-700'}`} />
          </button>
          */}
          {canModerate && (
            <div className="relative admin-menu">
              <button onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(v => !v);
              }}
                className="p-2 rounded-full bg-white/90 hover:bg-white" aria-label="More">
                <MoreHorizontal className="w-4 h-4 text-gray-700" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-md bg-white shadow-lg p-1 border border-gray-200 z-10">
                  <button onClick={(e) => {
                    e.stopPropagation();
                    togglePublic();
                  }} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 text-left">
                    {localMedia.isPublic ? <EyeOff className="w-4 h-4 text-gray-600"/> : <Eye className="w-4 h-4 text-gray-600"/>}
                    <span className="text-sm">{localMedia.isPublic ? 'Hide (make private)' : 'Make public'}</span>
                  </button>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    onClickDelete();
                  }} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-red-50 text-red-600 text-left">
                    <Trash2 className="w-4 h-4"/> 
                    <span className="text-sm">Delete</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{localMedia.title}</h3>
        {localMedia.eventTitle && (
          <div className="mb-2">
            <div className="inline-flex items-center px-3 py-1 bg-[#F25129]/10 text-[#F25129] rounded-full text-sm font-medium border border-[#F25129]/20">
              <Tag className="w-3 h-3 mr-1" />
              {localMedia.eventTitle}
            </div>
          </div>
        )}
        {localMedia.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{localMedia.description}</p>}

        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>By {localMedia.uploaderName || 'Member'}</span>
          <span>{safeFormat(createdAt, 'MMM d, yyyy', '')}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={(e) => {
              e.stopPropagation();
              handleLikeToggle();
            }} className={`flex items-center space-x-1 transition-colors ${liked? 'text-red-500':'text-gray-500 hover:text-red-500'}`}>
              <Heart className={`w-5 h-5 ${liked? 'fill-current':''}`} />
              <span className="text-sm">{likesCount}</span>
            </button>

            <button onClick={(e) => {
              e.stopPropagation();
              comments.setOpen(!comments.open);
            }} className="flex items-center space-x-1 text-gray-500 hover:text-[#F25129] transition-colors">
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm" title={`Real-time count: ${comments.commentsCount}`}>
                {comments.commentsCount}
              </span>
              {comments.comments.length > 0 && !comments.open && (
                <span className="text-xs text-gray-400">• View all</span>
              )}
            </button>
          </div>
          {/* View count hidden from UI but still tracked in background */}
          {/* {typeof localMedia.viewsCount === 'number' && (
            <div className="text-xs text-gray-400">{localMedia.viewsCount} views</div>
          )} */}
        </div>

        {/* Show latest comment preview when collapsed */}
        {!comments.open && comments.comments.length > 0 && (
          <div className="mt-2 p-2 bg-gray-50 rounded-lg border-l-2 border-[#F25129]">
            <div className="text-xs text-gray-600 truncate">
              <span className="font-medium">{comments.comments[0]?.authorName || 'Member'}:</span> {comments.comments[0]?.text}
            </div>
            {comments.comments.length > 1 && (
              <div className="text-xs text-gray-400 mt-1">
                and {comments.comments.length - 1} more comment{comments.comments.length > 2 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {comments.open && (
          <div className="mt-3 space-y-3 relative">
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {comments.comments.map((c:any)=> (
                <div key={c.id} className="text-sm text-gray-700">
                  <span className="font-medium">{c.authorName || 'Member'}:</span> {c.text}
                </div>
              ))}
            </div>
            {/* Gradient fade at bottom for visual polish */}
            {comments.comments.length > 3 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/80 to-transparent" />
            )}
            {comments.hasMore && (
              <button onClick={(e) => {
                e.stopPropagation();
                comments.loadMore();
              }} className="text-xs text-[#F25129] hover:underline">Load more</button>
            )}
            <form onSubmit={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              if (!currentUser || !newComment.trim()) return;
              
              try {
                await addDoc(collection(db, 'media', localMedia.id, 'comments'), {
                  text: newComment.trim(),
                  authorId: currentUser.id,
                  authorName: currentUser.displayName || 'Member',
                  createdAt: serverTimestamp(),
                });
                
                setNewComment('');
                // Real-time listener will update the count automatically
              } catch (error: any) {
                toast.error('Failed to post comment: ' + error.message);
              }
            }} className="flex items-center gap-2">
              <input value={newComment} onChange={e=>setNewComment(e.target.value)} onClick={(e) => e.stopPropagation()}
                className="flex-1 px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129]" placeholder="Add a comment…" />
              <button onClick={(e) => e.stopPropagation()} className="px-3 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors">Post</button>
            </form>
          </div>
        )}
      </div>

      {/* Custom Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this media?"
        message="This action cannot be undone. All associated files will be permanently removed."
        confirmText="Delete"
        cancelText="Cancel"
        danger
        onConfirm={actuallyDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
