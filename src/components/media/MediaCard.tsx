import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Heart, MessageCircle, Tag, Play, Share2, Download, MoreHorizontal, EyeOff, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, updateDoc, increment, setDoc } from 'firebase/firestore';
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
  const [showComments, setShowComments] = useState(false);
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
  
  // Load thumbnail URL if available
  useEffect(() => {
    setIsThumbnailLoading(true);
    if (media.thumbnailPath) {
      getDownloadURL(ref(storage, media.thumbnailPath))
        .then(url => {
          setThumbnailUrl(url);
          setIsThumbnailLoading(false);
        })
        .catch(error => {
          console.warn('Failed to load thumbnail:', error);
          setThumbnailUrl(media.url); // Fallback to original
          setIsThumbnailLoading(false);
        });
    } else {
      setThumbnailUrl(media.url);
      setIsThumbnailLoading(false);
    }
  }, [media.thumbnailPath, media.url]);

  // Attach HLS when video element is ready and HLS source is available
  useEffect(() => {
    if (videoRef.current && media.sources?.hls && !isHlsAttached) {
      // HLS is ready - upgrade to HLS streaming
      attachHls(videoRef.current, media.sources.hls)
        .then(() => setIsHlsAttached(true))
        .catch(error => {
          console.warn('Failed to attach HLS, using fallback:', error);
          // Fallback to original video URL
          if (videoRef.current) {
            videoRef.current.src = media.url;
          }
        });
    } else if (videoRef.current && !isHlsAttached && !media.sources?.hls) {
      // No HLS yet - show original file immediately for instant playback
      videoRef.current.src = media.url;
    }
  }, [media.sources?.hls, media.url, isHlsAttached]);

  // Cleanup HLS when component unmounts or media changes
  useEffect(() => {
    return () => {
      if (videoRef.current && isHlsAttached) {
        detachHls(videoRef.current);
        setIsHlsAttached(false);
      }
    };
  }, [isHlsAttached]);
  useViewCounter(media.id, videoRef.current ?? null);

  // Like toggle (optimistic) - Cloud Functions handle counter updates
  const handleLikeToggle = async () => {
    if (!canEngage || !currentUser) { 
      toast.error('Only members can like.'); 
      return; 
    }
    
    const likeRef = doc(db, 'media', media.id, 'likes', currentUser.id);
    
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
        // Note: commentsCount will be updated by Cloud Function
      }
    } catch (e: any) {
      // Revert optimistic updates on error
      setLiked(v => !v); 
      setLikesCount(c => c + (liked ? 1 : -1));
      toast.error(e?.message || 'Failed to update like');
    }
  };

  const onDoubleTap = () => { if (!liked) handleLikeToggle(); };

  // Admin/owner functions
  const canModerate = !!currentUser && (currentUser.role === 'admin' || currentUser.id === media.uploadedBy);

  async function togglePublic() {
    try {
      await updateDoc(doc(db, 'media', media.id), { isPublic: !media.isPublic });
      toast.success(media.isPublic ? 'Hidden from public' : 'Now public');
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
      await deleteDoc(doc(db, 'media', media.id));
      // Cloud Function will delete Storage assets (see section 5)
      toast.success('Media deleted successfully');
    } catch (e: any) { 
      toast.error(e.message || 'Failed to delete media'); 
    }
  }

  const comments = usePagedComments(media.id, 10);

  const previewEl = useMemo(() => {
    return media.type === 'video' ? (
      <div className="relative" onDoubleClick={onDoubleTap} onClick={onOpen}>
        <video 
          ref={videoRef} 
          poster={thumbnailUrl} 
          playsInline 
          controls 
          preload="metadata"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        >
          {/* Original source for immediate playback while HLS processes */}
          <source src={media.url} type={media.type === 'video' ? 'video/mp4' : 'video/*'} />
          {/* HLS will be attached dynamically via useEffect when ready */}
        </video>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center">
            <Play className="w-6 h-6 text-purple-600 ml-0.5" />
          </div>
        </div>
        {/* Show processing status if available */}
        {media.transcodeStatus === 'processing' && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Upgrading...
            </div>
          </div>
        )}
        {media.transcodeStatus === 'failed' && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              Upgrade Failed
            </div>
          </div>
        )}
        {media.transcodeStatus === 'ready' && media.type === 'video' && media.sources?.hls && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              HLS Ready
            </div>
          </div>
        )}
        {media.transcodeStatus === 'ready' && media.type === 'image' && media.thumbnailPath && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              Optimized
            </div>
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
          alt={media.title} 
          loading="lazy" 
          onDoubleClick={onDoubleTap} 
          onClick={onOpen}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
        />
      )
    );
  }, [media, onOpen, liked, thumbnailUrl, isThumbnailLoading]);

  const createdAt = media.createdAt instanceof Date ? media.createdAt : new Date(media.createdAt);

  return (
    <div className="bg-white/80 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-purple-100 group">
      <div className="relative aspect-square overflow-hidden">
        {previewEl}
        {media.eventTitle && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-purple-600 border border-purple-200">
              <Tag className="w-3 h-3 mr-1" />
              {media.eventTitle}
            </div>
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
          <button onClick={()=>shareUrl(media.url, media.title)} className="p-2 rounded-full bg-white/90 hover:bg-white">
            <Share2 className="w-4 h-4 text-gray-700" />
          </button>
          <a href={media.url} download className="p-2 rounded-full bg-white/90 hover:bg-white">
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
                    {media.isPublic ? <EyeOff className="w-4 h-4 text-gray-600"/> : <Eye className="w-4 h-4 text-gray-600"/>}
                    <span className="text-sm">{media.isPublic ? 'Hide (make private)' : 'Make public'}</span>
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
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{media.title}</h3>
        {media.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{media.description}</p>}

        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>By {media.uploaderName || 'Member'}</span>
          <span>{format(createdAt, 'MMM d, yyyy')}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={handleLikeToggle} className={`flex items-center space-x-1 transition-colors ${liked? 'text-red-500':'text-gray-500 hover:text-red-500'}`}>
              <Heart className={`w-5 h-5 ${liked? 'fill-current':''}`} />
              <span className="text-sm">{likesCount}</span>
            </button>

            <button onClick={()=> comments.setOpen(!comments.open)} className="flex items-center space-x-1 text-gray-500 hover:text-purple-600 transition-colors">
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm">{comments.comments.length}</span>
            </button>
          </div>
          {typeof media.viewsCount === 'number' && (
            <div className="text-xs text-gray-400">{media.viewsCount} views</div>
          )}
        </div>

        {comments.open && (
          <div className="mt-3 space-y-3">
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {comments.comments.map((c:any)=> (
                <div key={c.id} className="text-sm text-gray-700">
                  <span className="font-medium">{c.authorName || 'Member'}:</span> {c.text}
                </div>
              ))}
            </div>
            {comments.hasMore && (
              <button onClick={comments.loadMore} className="text-xs text-purple-600 hover:underline">Load more</button>
            )}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!currentUser || !newComment.trim()) return;
              
              try {
                await addDoc(collection(db, 'media', media.id, 'comments'), {
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
                className="flex-1 px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-purple-500" placeholder="Add a comment…" />
              <button className="px-3 py-2 bg-purple-600 text-white rounded-md">Post</button>
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