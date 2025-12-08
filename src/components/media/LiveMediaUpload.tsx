import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Video as VideoIcon, Upload, X, Instagram, Facebook } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { uploadBytesResumable, ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useStorage } from '../../hooks/useStorage';
import { useFirestore } from '../../hooks/useFirestore';
import { LoadingButton } from '../ui/LoadingSpinner';
import EventTypeahead from './EventTypeahead';
import CameraPreview from './CameraPreview';
import MediaControls from './MediaControls';
import TrimEditor from './TrimEditor';
import useMediaCapture, { Mode } from './useMediaCapture';
import toast from 'react-hot-toast';
import { ContentModerationService } from '../../services/contentModerationService';

interface LiveMediaUploadProps {
  eventId?: string;
  onClose: () => void;
}

export const LiveMediaUpload: React.FC<LiveMediaUploadProps> = ({ eventId, onClose }) => {
  const { currentUser } = useAuth();
  const { getStoragePath } = useStorage();
  const { addDocument, useRealtimeCollection } = useFirestore();

  // Single source of truth for MODE here
  const [mode, setMode] = useState<Mode>('reel');

  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTask, setUploadTask] = useState<any>(null);

  const [socialMediaOptions, setSocialMediaOptions] = useState({
    instagram: true,
    facebook: true,
    website: true,
  });

  const [selectedEvent, setSelectedEvent] = useState<{ id: string | null; title: string | null }>(() => ({
    id: eventId || null,
    title: null,
  }));

  const [burstEnabled, setBurstEnabled] = useState(false);

  // DOM refs passed into the hook so it writes to the SAME elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    mediaBlob,
    previewUrl,
    thumbnailBlob,
    cameraOn,
    streamReady,
    isRecording,
    recordingTime,
    countdown,
    isFlashing,
    isStartingCamera,

    photoFilter,
    videoEffect,
    autoEnhance,
    textOverlay,
    keepCameraActive,
    zoomLevel,

    maxRecordingTime,
    trimStart,
    trimEnd,

    devices,
    deviceId,
    permissionState,

    startPreview,
    startRecording,
    stopRecording,
    capturePhoto,
    releaseCamera,
    resetRecording,

    setPhotoFilter,
    setVideoEffect,
    setAutoEnhance,
    setTextOverlay,
    setKeepCameraActive,
    setZoomLevel,
    setMaxRecordingTime,
    setTrimStart,
    setTrimEnd,
    setDeviceId,
    setCountdown,
    setMediaBlob,
    setPreviewUrl,
  } = useMediaCapture(videoRef, canvasRef, mode);

  // Events
  const { data: events } = useRealtimeCollection('events', []);

  // Debug markers (won’t cause mode thrashing)
  useEffect(() => {
    // NOTE: StrictMode will double-mount in dev; that’s OK now.
    // eslint-disable-next-line no-console
    console.log('🎬 LiveMediaUpload mounted');
    return () => {
      // eslint-disable-next-line no-console
      console.log('🎬 LiveMediaUpload unmounted');
    };
  }, []);

  // Handlers
  const handlePrimaryStart = useCallback(() => {
    if (mode === 'photo') {
      if (!cameraOn) {
        toast.error('Start the camera first');
        return;
      }
      if (burstEnabled) {
        // simple burst: 5 shots, 200ms apart
        let i = 0;
        const id = setInterval(async () => {
          i += 1;
          await capturePhoto();
          if (i >= 5) clearInterval(id);
        }, 200);
      } else {
        capturePhoto();
      }
    } else {
      if (!cameraOn) {
        toast.error('Start the camera first');
        return;
      }
      startRecording();
    }
  }, [mode, cameraOn, burstEnabled, capturePhoto, startRecording]);

  const handleFilePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMediaBlob(file);
    setPreviewUrl(url);
  };

  const uploadAndShare = async () => {
    if (!currentUser) {
      toast.error('You must be signed in.');
      return;
    }
    if (!mediaBlob) {
      toast.error('No media to upload.');
      return;
    }
    if (mediaBlob.size > 100 * 1024 * 1024) {
      toast.error('File too large (max 100MB).');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      console.log('🔍 Upload debug:', { mode, blobType: mediaBlob.type, blobSize: mediaBlob.size });
      const isPhoto = mode === 'photo' || mediaBlob.type.startsWith('image/') || mediaBlob.type === 'image/jpeg';
      console.log('🔍 isPhoto result:', isPhoto);
      let finalBlob = mediaBlob;

      if (!isPhoto && (trimStart > 0 || (trimEnd && trimEnd < recordingTime))) {
        // NOTE: Blob.slice is byte-based; we’d need ffmpeg.wasm to do a real A/V trim.
        // For now we keep full video and just store trim metadata.
      }

      const ext = finalBlob.type.includes('mp4')
        ? 'mp4'
        : finalBlob.type.includes('webm')
        ? 'webm'
        : isPhoto
        ? 'jpg'
        : 'webm';

      const file = new File([finalBlob], `${isPhoto ? 'photo' : 'video'}-${Date.now()}.${ext}`, {
        type: finalBlob.type || (isPhoto ? 'image/jpeg' : 'video/webm'),
      });

      // Generate UUID once for consistent path
      const batchId = uuidv4();
      const path = `media/${currentUser.id}/${batchId}/${file.name}`;
      
      console.log('🔍 LiveUpload path consistency check:', { 
        path, 
        fileName: file.name,
        batchId 
      });
      
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      setUploadTask(task);

      task.on('state_changed', s => {
        setUploadProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100));
      });

      const snapshot = await task;
      const mediaUrl = await getDownloadURL(snapshot.ref);

      // If we generated a thumbnail, upload it too
      let thumbnailUrl = mediaUrl;
      if (thumbnailBlob) {
        const thumbRef = ref(storage, path.replace(/\.[^/.]+$/, '_thumb.jpg'));
        await uploadBytesResumable(thumbRef, thumbnailBlob);
        thumbnailUrl = await getDownloadURL(thumbRef);
      }

      // Run content moderation on description before saving
      const descriptionToModerate = description.trim();
      let moderationResult = null;
      if (descriptionToModerate) {
        moderationResult = await ContentModerationService.moderateContent(
          descriptionToModerate,
          'media',
          currentUser.id
        );

        // If content is blocked, don't save it
        if (moderationResult.isBlocked) {
          toast.error(moderationResult.reason || 'Your media cannot be published due to inappropriate content.');
          setUploadProgress(0);
          setUploadTask(null);
          return;
        }
      }

      // IMPORTANT: keep 'type' to 'image' or 'video' only; flag reels separately
      const mediaType = isPhoto ? 'image' : 'video';
      console.log('🔍 Storing media type:', mediaType, 'for isPhoto:', isPhoto);
      
      // Determine moderation status
      const moderationStatus = moderationResult?.requiresApproval ? 'pending' : 'approved';
      
      await addDocument('media', {
        type: mediaType,        // <-- CHANGED
        url: mediaUrl,
        thumbnailUrl,
        uploadedBy: currentUser.id,
        uploadedByName: currentUser.displayName || 'Member',
        description: descriptionToModerate,
        eventId: selectedEvent.id,
        isLiveRecording: !isPhoto,
        isPhotoCapture: isPhoto,
        isReel: !isPhoto && mode === 'reel',      // <-- reels flagged here
        filter: isPhoto ? photoFilter : videoEffect,
        autoEnhance,
        textOverlay: textOverlay || null,
        // Store trim metadata even if we didn't cut the bytes
        trim: !isPhoto ? { start: trimStart, end: trimEnd || recordingTime } : null,
        duration: !isPhoto ? recordingTime : null,
        moderationStatus,                          // 'pending' | 'approved' | 'rejected'
        requiresApproval: moderationResult?.requiresApproval || false,
        moderationReason: moderationResult?.reason,
        moderationDetectedIssues: moderationResult?.detectedIssues || [],
        createdAt: new Date(),
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        // CRITICAL: Add fields that Cloud Function needs to find and process this media
        filePath: path,                           // Full path to file in Storage
        storageFolder: path.substring(0, path.lastIndexOf('/') + 1),   // Directory path in Storage (with trailing slash)
        transcodeStatus: 'pending',               // Initial status for Cloud Function
      });
      
      // Show appropriate message based on moderation result
      if (moderationResult?.requiresApproval) {
        toast.success('Media uploaded! It will be reviewed before being published.');
      } else {
        toast.success('Media uploaded successfully!');
      }

      if (socialMediaOptions.website) {
        // your site reads from Firestore; nothing to do
      }
      if (socialMediaOptions.facebook) {
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(mediaUrl)}&quote=${encodeURIComponent(
            description
          )}`,
          '_blank'
        );
      }
      if (socialMediaOptions.instagram) {
        // Instagram web flow placeholder
        window.open(`https://www.instagram.com/create/`, '_blank');
      }

      toast.success('Uploaded!');
      onClose();
    } catch (e: any) {
      console.error('upload error', e);
      toast.error(e?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadTask(null);
    }
  };

  const cancelUpload = () => {
    if (uploadTask) {
      uploadTask.cancel();
      setUploadTask(null);
      setIsUploading(false);
      setUploadProgress(0);
      toast('Upload cancelled', { icon: '🛑' });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      // If backdrop clicks are accidentally closing the modal during camera init,
      // comment the onClick below to disable backdrop-close:
      // onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold">Create Media</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* Left: Camera / Preview */}
          <div className="flex-1 p-6">
            {/* Camera Selector */}
            {devices.length > 1 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Camera</label>
                <select
                  value={deviceId || ''}
                  onChange={(e) => {
                    console.log('📷 Camera selection changed to:', e.target.value);
                    setDeviceId(e.target.value || undefined);
                  }}
                  className="border rounded px-3 py-2 w-full"
                >
                  {devices.map((device, index) => {
                    // Clean up device labels for better UX
                    let label = device.label || `Camera ${index + 1}`;
                    if (label.includes('facing back')) label = 'Back Camera';
                    if (label.includes('facing front')) label = 'Front Camera';
                    if (label.includes('Back Dual Wide')) label = 'Back Wide Camera';
                    if (label.includes('Back Dual Ultra Wide')) label = 'Back Ultra Wide Camera';
                    if (label.includes('Back Triple')) label = 'Back Triple Camera';
                    
                    return (
                      <option key={device.deviceId} value={device.deviceId}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            
            <CameraPreview
              cameraOn={cameraOn}
              streamReady={streamReady}
              isRecording={isRecording}
              recordingTime={recordingTime}
              countdown={countdown}
              isFlashing={isFlashing}
              videoRef={videoRef}
              canvasRef={canvasRef}
              videoEffect={videoEffect}
              zoomLevel={zoomLevel}
              onResetZoom={() => setZoomLevel(1)}
              previewUrl={previewUrl}            // <-- NEW: show recorded/picked preview
              mediaType={mode === 'photo' || (mediaBlob && mediaBlob.type.startsWith('image/')) ? 'image' : 'video'}
              onClearPreview={() => setPreviewUrl(null)}  // <-- NEW: clear preview to return to live camera
            />

            {/* Mode selector */}
            <div className="flex justify-center mt-4 space-x-2">
              {(['reel', 'video', 'photo'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    if (isRecording) return; // Prevent mode changes during recording
                    setMode(m);
                    setCountdown(0); // cancel any running countdown when switching
                  }}
                  disabled={isRecording}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isRecording
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                      : mode === m 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {m === 'reel' ? (
                    <Instagram className="w-4 h-4 inline mr-1" />
                  ) : m === 'video' ? (
                    <VideoIcon className="w-4 h-4 inline mr-1" />
                  ) : (
                    <Camera className="w-4 h-4 inline mr-1" />
                  )}
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="mt-6">
              <MediaControls
                mode={mode}
                isRecording={isRecording}
                streamReady={streamReady}
                isStartingCamera={isStartingCamera}
                countdown={countdown}
                burstEnabled={burstEnabled}
                onToggleBurst={() => setBurstEnabled((b) => !b)}
                onPrimaryStart={handlePrimaryStart}
                onStopRecording={stopRecording}
                onStartCamera={() => startPreview(mode)}
                maxRecordingTime={maxRecordingTime}
                setMaxRecordingTime={setMaxRecordingTime}
                permissionState={permissionState}
                onFilePick={handleFilePicker}
              />
            </div>
          </div>

          {/* Right: Settings & Upload */}
          <div className="w-80 border-l p-6 overflow-y-auto space-y-6">
            {/* Recording Status */}
            {isRecording && (
              <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-red-700 font-medium">Recording in progress...</span>
                </div>
                <p className="text-red-600 text-sm mt-1">
                  Only the "Stop Recording" button is available during recording.
                </p>
              </div>
            )}
            
            {/* Effects */}
            <div className="space-y-3">
              <label className="block text-sm font-medium">Filter / Effect</label>
              <div className="flex gap-2 flex-wrap">
                {['none', 'grayscale', 'sepia', 'vintage', 'bright', 'contrast'].map((f) => (
                  <button
                    key={f}
                    onClick={() => (mode === 'photo' ? setPhotoFilter(f) : setVideoEffect(f))}
                    disabled={isRecording}
                    className={`px-3 py-1 rounded-full text-sm ${
                      isRecording
                        ? 'bg-gray-300 cursor-not-allowed opacity-50'
                        : (mode === 'photo' ? photoFilter : videoEffect) === f
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Auto enhance</span>
                <button
                  onClick={() => setAutoEnhance(!autoEnhance)}
                  disabled={isRecording}
                  className={`h-6 w-11 rounded-full relative ${
                    isRecording 
                      ? 'bg-gray-300 cursor-not-allowed opacity-50' 
                      : autoEnhance ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle auto enhance"
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      autoEnhance ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Text overlay</label>
                <input
                  value={textOverlay}
                  onChange={(e) => setTextOverlay(e.target.value.slice(0, 50))}
                  disabled={isRecording}
                  className={`w-full border rounded px-3 py-2 ${
                    isRecording ? 'bg-gray-100 cursor-not-allowed opacity-50' : ''
                  }`}
                  placeholder="Add text (max 50 chars)"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Keep camera active after shot</span>
                <button
                  onClick={() => setKeepCameraActive(!keepCameraActive)}
                  disabled={isRecording}
                  className={`h-6 w-11 rounded-full relative ${
                    isRecording 
                      ? 'bg-gray-300 cursor-not-allowed opacity-50' 
                      : keepCameraActive ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle keep camera active"
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      keepCameraActive ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Trim (previewed videos) */}
            {previewUrl && mode !== 'photo' && (
              <TrimEditor
                recordingTime={recordingTime}
                trimStart={trimStart}
                trimEnd={trimEnd || recordingTime}
                setTrimStart={setTrimStart}
                setTrimEnd={setTrimEnd}
              />
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isRecording}
                rows={3}
                className={`w-full border rounded px-3 py-2 ${
                  isRecording ? 'bg-gray-100 cursor-not-allowed opacity-50' : ''
                }`}
                placeholder="Add a description..."
                maxLength={280}
              />
            </div>

            {/* Event */}
            <div>
              <label className="block text-sm font-medium mb-1">Event (optional)</label>
              <div className={isRecording ? 'opacity-50 pointer-events-none' : ''}>
                <EventTypeahead
                  value={selectedEvent}
                  onChange={setSelectedEvent}
                  seedEvents={events as any}
                  placeholder="Search events..."
                />
              </div>
            </div>

            {/* Social */}
            <div>
              <label className="block text-sm font-medium mb-2">Share to</label>
              <div className={`space-y-2 ${isRecording ? 'opacity-50 pointer-events-none' : ''}`}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={socialMediaOptions.website}
                    onChange={(e) => setSocialMediaOptions((s) => ({ ...s, website: e.target.checked }))}
                    disabled={isRecording}
                  />
                  Website
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={socialMediaOptions.facebook}
                    onChange={(e) => setSocialMediaOptions((s) => ({ ...s, facebook: e.target.checked }))}
                    disabled={isRecording}
                  />
                  <Facebook className="w-4 h-4" />
                  Facebook
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={socialMediaOptions.instagram}
                    onChange={(e) => setSocialMediaOptions((s) => ({ ...s, instagram: e.target.checked }))}
                    disabled={isRecording}
                  />
                  <Instagram className="w-4 h-4" />
                  Instagram
                </label>
              </div>
            </div>

            {/* Upload controls */}
            <div className="pt-2 border-t">
              {isUploading ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full">
                    <div
                      className="h-2 bg-blue-600 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <button onClick={cancelUpload} className="mt-2 text-sm text-gray-700 underline">
                    Cancel upload
                  </button>
                </div>
              ) : (
                <LoadingButton
                  loading={isUploading}
                  onClick={uploadAndShare}
                  disabled={!mediaBlob}
                  className="w-full justify-center bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Share
                </LoadingButton>
              )}
              <div className="mt-2">
                <label className="block text-xs text-gray-500">Or pick a file</label>
                <input 
                  type="file" 
                  accept="image/*,video/*" 
                  onChange={handleFilePicker}
                  disabled={isRecording}
                  className={isRecording ? 'opacity-50 cursor-not-allowed' : ''}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
