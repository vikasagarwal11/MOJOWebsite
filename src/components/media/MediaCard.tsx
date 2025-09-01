import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Heart, MessageCircle, Tag, Play, Share2, Download, MoreHorizontal, EyeOff, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, updateDoc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { useViewCounter } from '../../hooks/useViewCounter';
import { usePagedComments } from '../../hooks/usePagedComments';
import { shareUrl } from '../../utils/share';
import { attachHls, detachHls } from '../../utils/hls';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../config/firebase';
import toast from 'react-hot-toast';
import ConfirmDialog from '../ConfirmDialog';

export default function MediaCard({ media, onOpen }:{ media:any; onOpen?:()=>void }) {
  const { currentUser } = useAuth();
  const canEngage = !!currentUser && (currentUser.role === 'member' || currentUser.role === 'admin');

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
          setLocalMedia((prev: any) => ({
            ...prev,
            ...serverData
          }));
          
          // Debug: Log status changes
          if (serverData.transcodeStatus !== media.transcodeStatus) {
            console.log('🔄 Media status updated:', {
              mediaId: media.id,
              oldStatus: media.transcodeStatus,
              newStatus: serverData.transcodeStatus,
              hasHls: !!serverData.sources?.hls
            });
          }
        }
      },
      (error: any) => {
        console.warn('Failed to sync media data:', error);
      }
    );
    
    return unsubscribe;
  }, [media.id, media.transcodeStatus]);
  
  // Load thumbnail URL if available
  useEffect(() => {
    setIsThumbnailLoading(true);
    if (localMedia.thumbnailPath) {
      getDownloadURL(ref(storage, localMedia.thumbnailPath))
        .then(url => {
          setThumbnailUrl(url);
          setIsThumbnailLoading(false);
        })
        .catch(error => {
          console.warn('Failed to load thumbnail:', error);
          setThumbnailUrl(localMedia.url); // Fallback to original
          setIsThumbnailLoading(false);
        });
    } else {
      setThumbnailUrl(localMedia.url);
      setIsThumbnailLoading(false);
    }
  }, [localMedia.thumbnailPath, localMedia.url]);

  // Enhanced debugging for video playback issues
  useEffect(() => {
    console.log('🎬 MediaCard Debug:', {
      mediaId: localMedia.id,
      type: localMedia.type,
      transcodeStatus: localMedia.transcodeStatus,
      hasHls: !!localMedia.sources?.hls,
      hlsPath: localMedia.sources?.hls,
      hasThumbnail: !!localMedia.thumbnailPath,
      thumbnailPath: localMedia.thumbnailPath,
      videoUrl: localMedia.url,
      isHlsAttached,
      videoRefExists: !!videoRef.current
    });
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

    console.log('🔧 HLS Attachment Logic:', {
      hasVideoRef: !!videoRef.current,
      hasHlsSource: !!localMedia.sources?.hls,
      hlsPath: localMedia.sources?.hls,
      isAlreadyAttached: isHlsAttached,
      videoUrl: localMedia.url
    });

    if (videoRef.current && localMedia.sources?.hls && !isHlsAttached) {
      console.log('✅ Attempting to attach HLS:', localMedia.sources.hls);
      // HLS is ready - upgrade to HLS streaming
      attachHls(videoRef.current, localMedia.sources.hls)
        .then(() => {
          console.log('✅ HLS attached successfully');
          setIsHlsAttached(true);
        })
        .catch(error => {
          console.error('❌ Failed to attach HLS, using fallback:', error);
          // Fallback to original video URL
          if (videoRef.current) {
            console.log('🔄 Setting fallback video source:', localMedia.url);
            videoRef.current.src = localMedia.url;
          }
        });
    } else if (videoRef.current && !isHlsAttached && !localMedia.sources?.hls) {
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
  }, [localMedia.sources?.hls, localMedia.url, isHlsAttached]);

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
      await deleteDoc(doc(db, 'media', localMedia.id));
      // Cloud Function will delete Storage assets (see section 5)
      toast.success('Media deleted successfully');
    } catch (e: any) { 
      toast.error(e.message || 'Failed to delete media'); 
    }
  }

  const comments = usePagedComments(localMedia.id, 10, { initialOpen: false });
  
  // Debug logging for comment count discrepancy
  useEffect(() => {
    if (localMedia.commentsCount !== undefined && comments.comments.length !== localMedia.commentsCount) {
      console.log('🔍 Comment count mismatch detected:', {
        mediaId: localMedia.id,
        serverCount: localMedia.commentsCount,
        localCount: comments.comments.length,
        comments: comments.comments.map(c => ({ id: c.id, text: c.text.substring(0, 20) }))
      });
    }
  }, [localMedia.commentsCount, comments.comments.length, localMedia.id, comments.comments]);
  
  // Real-time sync for comments count to prevent stale data
  useEffect(() => {
    if (!localMedia.id) return;
    
    const unsubscribe = onSnapshot(
      doc(db, 'media', localMedia.id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const serverCommentsCount = docSnapshot.data().commentsCount ?? 0;
          
          // Debug: Log if there's a mismatch
          if (serverCommentsCount !== (localMedia.commentsCount ?? 0)) {
            console.log('🔍 Comments count sync:', {
              mediaId: localMedia.id,
              oldCount: localMedia.commentsCount,
              newCount: serverCommentsCount,
              localCount: comments.comments.length
            });
          }
        }
      },
      (error: any) => {
        console.warn('Failed to sync comments count:', error);
      }
    );
    
    return unsubscribe;
  }, [localMedia.id, localMedia.commentsCount, comments.comments.length]);
  
  // Safe date parsing with fallback
  const createdAt = useMemo(() => {
    if (!localMedia.createdAt) return new Date();
    
    try {
      // Handle Firestore Timestamp objects
      if (localMedia.createdAt && typeof localMedia.createdAt === 'object' && 'seconds' in localMedia.createdAt) {
        // This is a Firestore Timestamp
        const timestamp = localMedia.createdAt as any;
        return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000);
      }
      
      if (localMedia.createdAt instanceof Date) {
        return localMedia.createdAt;
      }
      
      // Handle string dates
      const date = new Date(localMedia.createdAt);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date value:', localMedia.createdAt);
        return new Date();
      }
      
      return date;
    } catch (error) {
      console.warn('Date parsing error:', error);
      return new Date();
    }
  }, [localMedia.createdAt]);
  
  // One status object, one chip - prevents conflicting chips
  const status = useMemo(() => {
    const m = localMedia;
    if (!m) return null;

    if (m.transcodeStatus === 'failed') return { color: 'red', label: 'Upgrade Failed' };

    if (m.type === 'video') {
      if (m.transcodeStatus === 'ready' && !!m.sources?.hls) return { color: 'green', label: 'HLS Ready' };
      if (m.transcodeStatus === 'processing' && !!m.thumbnailPath) return { color: 'purple', label: 'Poster Ready' };
      if (m.transcodeStatus === 'processing') return { color: 'blue', label: 'Processing…' };
    }

    if (m.type === 'image') {
      if (m.transcodeStatus === 'ready' && !!m.thumbnailPath) return { color: 'green', label: 'Optimized' };
      if (m.transcodeStatus === 'processing') return { color: 'blue', label: 'Optimizing…' };
    }

    return null;
  }, [localMedia]);

  const previewEl = useMemo(() => {
    return localMedia.type === 'video' ? (
      <div className="relative" onDoubleClick={onDoubleTap} onClick={onOpen}>
        <video 
          ref={videoRef} 
          poster={thumbnailUrl} 
          playsInline 
          muted
          preload="metadata"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                 {/* Single status chip - prevents conflicting chips */}
         {status && (
           <div className={`absolute top-3 left-3 z-10 px-3 py-1.5 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-2
                          ${status.color === 'green' ? 'bg-green-500' :
                                    status.color === 'purple' ? 'bg-[#F25129]' :
        status.color === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}>
      <div className={`w-2 h-2 bg-white rounded-full ${status.color === 'blue' || status.color === 'purple' ? 'animate-pulse' : ''}`}></div>
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
        <img 
          src={thumbnailUrl} 
          alt={localMedia.title} 
          loading="lazy" 
          onDoubleClick={onDoubleTap} 
          onClick={onOpen}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
        />
      )
    );
  }, [localMedia, onOpen, liked, thumbnailUrl, isThumbnailLoading]);

  return (
          <div className="bg-white/80 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-[#F25129]/20 group" data-media-card>
      <div className="relative aspect-square overflow-hidden">
        {previewEl}
        {localMedia.eventTitle && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-[#F25129] border border-[#F25129]/30">
              <Tag className="w-3 h-3 mr-1" />
              {localMedia.eventTitle}
            </div>
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
          <button onClick={()=>shareUrl(localMedia.url, localMedia.title)} className="p-2 rounded-full bg-white/90 hover:bg-white">
            <Share2 className="w-4 h-4 text-gray-700" />
          </button>
          <a href={localMedia.url} download className="p-2 rounded-full bg-white/90 hover:bg-white">
            <Download className="w-4 h-4 text-gray-700" />
          </a>
          {canModerate && (
            <div className="relative admin-menu">
              <button onClick={() => setMenuOpen(v => !v)}
                className="p-2 rounded-full bg-white/90 hover:bg-white" aria-label="More">
                <MoreHorizontal className="w-4 h-4 text-gray-700" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-md bg-white shadow-lg p-1 border border-gray-200 z-10">
                  <button onClick={togglePublic} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 text-left">
                    {localMedia.isPublic ? <EyeOff className="w-4 h-4 text-gray-600"/> : <Eye className="w-4 h-4 text-gray-600"/>}
                    <span className="text-sm">{localMedia.isPublic ? 'Hide (make private)' : 'Make public'}</span>
                  </button>
                  <button onClick={onClickDelete} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-red-50 text-red-600 text-left">
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
        {localMedia.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{localMedia.description}</p>}

        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>By {localMedia.uploaderName || 'Member'}</span>
          <span>{format(createdAt, 'MMM d, yyyy')}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={handleLikeToggle} className={`flex items-center space-x-1 transition-colors ${liked? 'text-red-500':'text-gray-500 hover:text-red-500'}`}>
              <Heart className={`w-5 h-5 ${liked? 'fill-current':''}`} />
              <span className="text-sm">{likesCount}</span>
            </button>

            <button onClick={()=> comments.setOpen(!comments.open)} className="flex items-center space-x-1 text-gray-500 hover:text-[#F25129] transition-colors">
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm" title={`Server count: ${localMedia.commentsCount}, Local count: ${comments.comments.length}`}>
                {localMedia.commentsCount ?? comments.comments.length}
              </span>
              {comments.comments.length > 0 && !comments.open && (
                <span className="text-xs text-gray-400">• View all</span>
              )}
            </button>
          </div>
          {typeof localMedia.viewsCount === 'number' && (
            <div className="text-xs text-gray-400">{localMedia.viewsCount} views</div>
          )}
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
              <button onClick={comments.loadMore} className="text-xs text-[#F25129] hover:underline">Load more</button>
            )}
            <form onSubmit={async (e) => {
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
                // Note: commentsCount will be updated by Cloud Function
              } catch (error: any) {
                toast.error('Failed to post comment: ' + error.message);
              }
            }} className="flex items-center gap-2">
              <input value={newComment} onChange={e=>setNewComment(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#F25129]" placeholder="Add a comment…" />
              <button className="px-3 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors">Post</button>
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