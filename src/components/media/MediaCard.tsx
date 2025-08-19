import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Tag, Play } from 'lucide-react';
import { format } from 'date-fns';
import { MediaFile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { analytics, perf } from '../../config/firebase';
import { logEvent } from 'firebase/analytics';
import { trace } from 'firebase/performance';

interface MediaCardProps {
  media: MediaFile;
}

/** Analytics helper */
function log(name: string, params?: Record<string, any>) {
  try {
    if (analytics) logEvent(analytics, name, params);
  } catch {}
}

/** ---- Performance: first media tile paint (one-time) ---- */
let mediaFirstPaintDone = false;
function markMediaFirstPaintOnce() {
  try {
    if (mediaFirstPaintDone || !perf) return;
    const t = trace(perf, 'media_first_paint');
    // This is a point-in-time mark; if you want a duration, start earlier in the page and stop here.
    t.start();
    t.stop();
    mediaFirstPaintDone = true;
  } catch {}
}

/** ---- HLS loader (on-demand, non-Safari) ---- */
async function ensureHls(video: HTMLVideoElement, src: string) {
  // If the browser natively supports HLS (Safari), just set src
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    if (video.src !== src) video.src = src;
    return;
  }
  // Only spin up hls.js for .m3u8 streams
  if (!/\.m3u8($|\?)/i.test(src)) {
    if (video.src !== src) video.src = src;
    return;
  }
  // Lazy import hls.js
  const Hls = (await import('hls.js')).default as any;
  const hls = new Hls();
  hls.loadSource(src);
  hls.attachMedia(video);
}

/** ---- Component ---- */
const MediaCard: React.FC<MediaCardProps> = ({ media }) => {
  const { currentUser } = useAuth();
  const [isLiked, setIsLiked] = useState(
    currentUser ? media.likes.includes(currentUser.id) : false
  );
  const [showComments, setShowComments] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasLoggedImpression, setHasLoggedImpression] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const canLike = !!currentUser;
  const isVideo = media.type === 'video';

  // Decide which source to play (prefer HLS if present)
  const videoSrc = useMemo<string>(() => {
    // If you add an `hlsUrl` in your metadata later, prefer it here:
    // return media.hlsUrl || media.url;
    return media.url;
  }, [media.url]);

  /** IntersectionObserver: log impressions and auto-pause */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const ratio = entry.intersectionRatio;

        // First impression (>= 0.5 visible)
        if (!hasLoggedImpression && ratio >= 0.5) {
          log('media_impression', { id: media.id, type: media.type, public: (media as any).isPublic });
          setHasLoggedImpression(true);
        }

        // Auto-pause when mostly off-screen
        const v = videoRef.current;
        if (v) {
          if (!v.paused && ratio < 0.2) {
            v.pause();
            setIsPlaying(false);
          }
        }
      },
      { root: null, threshold: [0, 0.2, 0.5, 1] }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [media.id, media.type, hasLoggedImpression]);

  /** Like handler (UI only here; persist in Firestore in your parent if desired) */
  const handleLike = () => {
    if (!canLike) return;
    const next = !isLiked;
    setIsLiked(next);
    log('media_like', { id: media.id, liked: next });
    // TODO: persist like (increment a counter or update an array) in your write path
  };

  /** Play video on demand, lazy-load HLS if needed */
  const handlePlay = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;

    try {
      await ensureHls(v, videoSrc);
      // Attributes to maximize inline playback
      v.muted = true;
      v.playsInline = true;
      // Safari requires calling play() after attributes set
      await v.play();
      setIsPlaying(true);
      log('media_play', { id: media.id });

      // When the first visible tile is fully ready (poster loaded or first frame), mark perf
      markMediaFirstPaintOnce();
    } catch (e) {
      // Could not play (autoplay policies, etc.)
      console.warn('Video play failed:', e);
    }
  };

  /** If an image (or poster thumb) loads and we haven't marked first paint yet, mark it */
  const onImageLoaded = () => {
    markMediaFirstPaintOnce();
  };

  return (
    <div
      ref={containerRef}
      className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-purple-100 group"
    >
      {/* Media Content */}
      <div className="relative aspect-square overflow-hidden">
        {isVideo ? (
          /* We render a lightweight poster first; only load the video stream on click */
          <div className="relative">
            {/* Poster / thumb */}
            <img
              ref={imgRef}
              src={media.thumbnailUrl || media.url}
              alt={media.title || 'Video'}
              loading="lazy"
              onLoad={onImageLoaded}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {/* Play overlay */}
            <button
              type="button"
              aria-label="Play video"
              onClick={handlePlay}
              className="absolute inset-0 bg-black/20 flex items-center justify-center focus:outline-none"
            >
              <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center ring-1 ring-purple-200 shadow">
                <Play className="w-8 h-8 text-purple-600 ml-1" />
              </div>
            </button>
            {/* Hidden <video> tag becomes active when play is requested */}
            <video
              ref={videoRef}
              // Don't set src now; ensureHls will attach src or hls instance on demand
              poster={media.thumbnailUrl || undefined}
              className={`absolute inset-0 w-full h-full object-cover ${isPlaying ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
              controls={isPlaying}
              playsInline
              muted
            />
          </div>
        ) : (
          <img
            ref={imgRef}
            src={media.url}
            alt={media.title || 'Image'}
            loading="lazy"
            onLoad={onImageLoaded}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}

        {/* Event Tag */}
        {media.eventTitle && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-purple-600 border border-purple-200">
              <Tag className="w-3 h-3 mr-1" />
              {media.eventTitle}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
          {media.title}
        </h3>

        {!!media.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {media.description}
          </p>
        )}

        {/* Meta Info */}
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>By {media.uploaderName || 'Member'}</span>
          <span>
            {format(
              // guard in case createdAt is a Firestore Timestamp not converted yet
              media.createdAt instanceof Date
                ? media.createdAt
                : // @ts-ignore – your hook already converts; this is a safety net
                  (typeof (media as any).createdAt?.toDate === 'function'
                    ? (media as any).createdAt.toDate()
                    : new Date()),
              'MMM d, yyyy'
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLike}
              disabled={!canLike}
              className={`flex items-center space-x-1 transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              } ${!canLike ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm">{media.likes?.length ?? 0}</span>
            </button>

            <button
              onClick={() => setShowComments((s) => !s)}
              className="flex items-center space-x-1 text-gray-500 hover:text-purple-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm">{media.comments?.length ?? 0}</span>
            </button>
          </div>
        </div>

        {/* Comments Section (UI only; wire up submit to Firestore if desired) */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-3">
              {(media.comments || []).map((comment: any) => (
                <div key={comment.id} className="text-sm">
                  <span className="font-medium text-gray-900">
                    {comment.authorName || 'Member'}
                  </span>
                  <span className="text-gray-600 ml-2">{comment.content}</span>
                </div>
              ))}

              {currentUser && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaCard;
