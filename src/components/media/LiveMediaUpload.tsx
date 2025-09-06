import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Video, Upload, X, Instagram, Facebook, Loader2, ChevronDown, Square, Music } from 'lucide-react';
import { uploadBytesResumable, ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useStorage } from '../../hooks/useStorage';
import { useFirestore } from '../../hooks/useFirestore';
import { LoadingButton } from '../ui/LoadingSpinner';
import EventTypeahead from './EventTypeahead';
import toast from 'react-hot-toast';

interface LiveMediaUploadProps {
  eventId?: string;
  onClose: () => void;
}

export const LiveMediaUpload: React.FC<LiveMediaUploadProps> = ({ eventId, onClose }) => {
  const { currentUser } = useAuth();
  const { getStoragePath } = useStorage();
  const { addDocument, useRealtimeCollection } = useFirestore();
  const [isRecording, setIsRecording] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [mediaMode, setMediaMode] = useState<'reel' | 'video' | 'photo'>('reel');
  const [cameraOn, setCameraOn] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoFilter, setPhotoFilter] = useState<string>('none');
  const [videoEffect, setVideoEffect] = useState<string>('none');
  const [keepCameraActive, setKeepCameraActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(() => localStorage.getItem('camDeviceId') || undefined);
  const [recordingTime, setRecordingTime] = useState(0);
  const [maxRecordingTime, setMaxRecordingTime] = useState(30); // Default for reel; adjustable
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTask, setUploadTask] = useState<any>(null);
  const [modeSwitchTimeout, setModeSwitchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isModeSwitching, setIsModeSwitching] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [socialMediaOptions, setSocialMediaOptions] = useState({
    instagram: true,
    facebook: true,
    website: true
  });
  const [isFlashing, setIsFlashing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [textOverlay, setTextOverlay] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<{ id: string | null; title: string | null }>({ id: eventId || null, title: null });

  // Fetch events for selection
  const { data: events } = useRealtimeCollection('events', []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // const canvasRef = useRef<HTMLCanvasElement>(null); // For future video effects
  
  // Prevent overlapping starts and stale reads
  const startingRef = useRef(false);
  const cameraOnRef = useRef(false);
  useEffect(() => { cameraOnRef.current = cameraOn; }, [cameraOn]);
  
  // Buffer for MediaRecorder chunks
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Enumerate camera devices on mount
  useEffect(() => {
    (async () => {
      try {
        // Check if mediaDevices is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn('⚠️ MediaDevices not supported. Camera access requires HTTPS or localhost.');
          return;
        }
        
        const list = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = list.filter(d => d.kind === 'videoinput');
        console.log('📷 Available cameras:', videoDevices.length, videoDevices);
        setDevices(videoDevices);
      } catch (error) {
        console.error('❌ Error getting devices:', error);
      }
    })();
  }, []);

  // Check camera permissions
  useEffect(() => {
    (async () => {
      try {
        const result = await navigator.permissions?.query({ name: 'camera' as PermissionName });
        setPermissionState(result?.state || 'unknown');
      } catch {}
    })();
  }, []);

  // Save device choice to localStorage
  useEffect(() => { 
    if (deviceId) localStorage.setItem('camDeviceId', deviceId); 
  }, [deviceId]);

  // Wait until video has real dimensions (>= HAVE_CURRENT_DATA)
  function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      const ready = () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      if (ready()) return resolve();
      
      const onReady = () => { if (ready()) { cleanup(); resolve(); } };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
      };
      
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
    });
  }

  const startPreview = useCallback(async (mode: 'reel' | 'video' | 'photo') => {
    if (startingRef.current || isStartingCamera) {
      console.log('🚫 Preview start already in progress, skipping');
      return;
    }
    
    if (streamRef.current && cameraOnRef.current) {
      console.log('📹 Preview already running, skipping');
      return;
    }
    
    startingRef.current = true;
    setIsStartingCamera(true);

    try {
      console.log('🎥 Starting camera preview for mode:', mode);
      
      // Check if camera access is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported. Please use HTTPS and a modern browser.');
      }
      
      // Only release camera if we're switching modes or have a different device
      if (streamRef.current && (streamRef.current.getVideoTracks()[0]?.getSettings().deviceId !== deviceId)) {
        releaseCamera();
        await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay for stability
      }

      setStreamReady(false);

      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { 
              deviceId: { exact: deviceId },
              width: { ideal: 1280, max: 1920 }, 
              height: { ideal: 720, max: 1080 }
            } 
          : { 
              width: { ideal: 1280, max: 1920 }, 
              height: { ideal: 720, max: 1080 }, 
              facingMode: 'user' 
            },
        audio: mode !== 'photo',
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setCameraOn(true);

    } catch (error: any) {
      console.error('❌ Error accessing camera:', error);
      let msg = 'Unable to access camera. ';
      switch (error?.name) {
        case 'NotAllowedError': msg += 'Please allow camera permissions and try again.'; break;
        case 'NotFoundError': msg += 'No camera found on this device.'; break;
        case 'NotReadableError': msg += 'Camera is already in use by another app.'; break;
        default: msg += 'Please check permissions and try again.';
      }
      toast.error(msg);
      setStreamReady(false);
      setCameraOn(false);
    } finally {
      startingRef.current = false;
      setIsStartingCamera(false);
    }
  }, [isStartingCamera, deviceId]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    try {
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mimeType = 'video/webm;codecs=vp8';
        else if (MediaRecorder.isTypeSupported('video/webm')) mimeType = 'video/webm';
        else mimeType = '';
      }

      const mr = mimeType 
        ? new MediaRecorder(streamRef.current, { mimeType, bitsPerSecond: 2_000_000 }) 
        : new MediaRecorder(streamRef.current, { bitsPerSecond: 2_000_000 });
      mediaRecorderRef.current = mr;
      recorderChunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data && e.data.size) recorderChunksRef.current.push(e.data); };

      mr.onstop = () => {
        clearTimeout(recordingTimerRef.current!);
        setRecordingTime(0);
        const chunks = recorderChunksRef.current;
        if (!chunks.length) {
          toast.error('No video data recorded');
          return;
        }
        const finalType = mimeType || chunks[0].type || 'video/webm';
        const blob = new Blob(chunks, { type: finalType });
        const url = URL.createObjectURL(blob);
        setMediaBlob(blob);
        setPreviewUrl(url);
        setIsRecording(false);
        releaseCamera();
      };

      mr.start(1000);
      setIsRecording(true);

      // Set up dynamic recording timer that updates with maxRecordingTime changes
      const startTime = Date.now();
      const checkRecordingTime = () => {
        if (!isRecording) return;
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);
        
        if (elapsed >= maxRecordingTime) {
          stopRecording();
          toast.success('Maximum recording time reached');
        } else {
          recordingTimerRef.current = setTimeout(checkRecordingTime, 1000);
        }
      };
      
      recordingTimerRef.current = setTimeout(checkRecordingTime, 1000);

      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
    }
  }, [isRecording, maxRecordingTime]);

  // Camera preview should only start when user explicitly opens the modal
  // Removed auto-start to prevent unwanted camera activation

  // Debounced mode switching with recording check
  const switchMode = useCallback((newMode: 'reel' | 'video' | 'photo') => {
    if (mediaMode === newMode || isModeSwitching) return;

    if (isRecording) {
      if (!window.confirm('Recording in progress. Stop recording and switch mode?')) {
        return;
      }
      stopRecording();
      toast.success('Recording stopped to switch mode');
    }

    if (previewUrl) {
      resetRecording();
    }

    if (modeSwitchTimeout) clearTimeout(modeSwitchTimeout);

    setIsModeSwitching(true);

    const timeout = setTimeout(async () => {
      try {
        setMediaMode(newMode);
        setIsModeSwitching(false);
        
        // Only restart camera if it's currently active AND user wants to keep it running
        // For now, don't auto-restart camera on mode switch
        // User should manually start camera if they want it running
      } catch (error) {
        console.error('Mode switch error:', error);
        setIsModeSwitching(false);
        toast.error('Failed to switch mode');
      }
    }, 300); // Reduced delay for better responsiveness

    setModeSwitchTimeout(timeout);
  }, [mediaMode, isRecording, modeSwitchTimeout, previewUrl, startPreview, isModeSwitching]);

  // Recording timer is now handled in startRecording function
  // This allows for dynamic maxRecordingTime changes during recording

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }, []);

  const releaseCamera = useCallback(() => {
    console.log('🛑 Releasing camera...');
    
    // Stop recording first
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('🛑 Stopped track:', track.kind);
      });
      streamRef.current = null;
    }
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    
    // Reset all camera-related state
    setIsRecording(false);
    setStreamReady(false);
    setCameraOn(false);
    cameraOnRef.current = false;
    startingRef.current = false;
    setIsStartingCamera(false);
    
    console.log('✅ Camera released');
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return toast.error('Camera not ready for photo capture');
    
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    if (navigator.vibrate) navigator.vibrate(100);

    const track = stream.getVideoTracks()[0];
    if (track && 'ImageCapture' in window) {
      try {
        const ImageCapture = (window as any).ImageCapture;
        const ic = new ImageCapture(track);
        const bitmap = await ic.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          if (photoFilter !== 'none') applyFilter(ctx, photoFilter, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              setCapturedPhoto(url);
              setMediaBlob(blob);
              setPreviewUrl(url);
              toast.success('Photo captured!');
              if (!keepCameraActive) releaseCamera();
            } else {
              toast.error('Failed to capture photo');
            }
          }, 'image/jpeg', 0.92);
        }
        return;
      } catch (error) {
        console.warn('ImageCapture failed, falling back:', error);
      }
    }

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      await waitForVideoReady(video);
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return toast.error('Camera not ready');
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      
      // Apply photo filter
      if (photoFilter !== 'none') applyFilter(ctx, photoFilter, canvas.width, canvas.height);
      
      // Apply auto-enhance
      if (autoEnhance) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Simple auto-enhance: increase contrast and brightness
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.2);     // Red
          data[i + 1] = Math.min(255, data[i + 1] * 1.2); // Green
          data[i + 2] = Math.min(255, data[i + 2] * 1.2); // Blue
        }
        ctx.putImageData(imageData, 0, 0);
      }
      
      // Add text overlay
      if (textOverlay) {
        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeText(textOverlay, 20, 50);
        ctx.fillText(textOverlay, 20, 50);
      }
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCapturedPhoto(url);
          setMediaBlob(blob);
          setPreviewUrl(url);
          toast.success('Photo captured!');
          if (!keepCameraActive) releaseCamera();
        } else {
          toast.error('Failed to capture photo');
        }
      }, 'image/jpeg', 0.92);
    }
  }, [photoFilter, keepCameraActive]);

  // Countdown for recording start
  // Countdown effect - starts recording when countdown reaches 0
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && mediaMode !== 'photo' && !isRecording && streamReady) {
      // Start recording when countdown reaches 0
      startRecording();
    }
  }, [countdown, mediaMode, isRecording, streamReady, startRecording]);

  const handleStartClick = () => {
    if (mediaMode !== 'photo') {
      if (countdown === 0) {
        setCountdown(3);
        // Recording will start automatically after countdown via useEffect
      }
    } else {
      capturePhoto();
    }
  };

  const handleFilePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    
    if (!isVideo && !isImage) {
      toast.error('Please select a valid image or video file');
      return;
    }

    setMediaBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMediaMode(isImage ? 'photo' : 'video');
    e.target.value = '';
  };

  const applyFilter = (ctx: CanvasRenderingContext2D, filter: string, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    switch (filter) {
      case 'grayscale':
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        break;
      case 'sepia':
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
          data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
          data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
        }
        break;
      case 'vintage':
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.2);
          data[i + 1] = Math.min(255, data[i + 1] * 1.1);
          data[i + 2] = Math.min(255, data[i + 2] * 0.9);
        }
        break;
      case 'bright':
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] + 30);
          data[i + 1] = Math.min(255, data[i + 1] + 30);
          data[i + 2] = Math.min(255, data[i + 2] + 30);
        }
        break;
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const uploadAndShare = async () => {
    if (!mediaBlob || !currentUser) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const isPhoto = mediaMode === 'photo' || capturedPhoto !== null;
      const ext = mediaBlob.type.includes('mp4') ? 'mp4' : mediaBlob.type.includes('webm') ? 'webm' : isPhoto ? 'jpg' : 'webm';
      
      // Apply video trimming if needed
      let finalBlob = mediaBlob;
      if (!isPhoto && (trimStart > 0 || trimEnd < recordingTime)) {
        const startMs = trimStart * 1000;
        const endMs = (trimEnd || recordingTime) * 1000;
        finalBlob = mediaBlob.slice(startMs, endMs);
      }
      
      const file = new File([finalBlob], `${isPhoto ? 'photo' : mediaMode === 'reel' ? 'reel' : 'video'}-${Date.now()}.${ext}`, { 
        type: finalBlob.type || (isPhoto ? 'image/jpeg' : 'video/webm') 
      });

      const mediaPath = getStoragePath('media', file.name);
      const storageRef = ref(storage, mediaPath);
      const task = uploadBytesResumable(storageRef, file);
      setUploadTask(task);
      
      task.on('state_changed', (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadProgress(progress);
      });

      const snapshot = await task;
      const mediaUrl = await getDownloadURL(snapshot.ref);

      const mediaData = {
        type: isPhoto ? 'image' : mediaMode === 'reel' ? 'reel' : 'video',
        url: mediaUrl,
        thumbnailUrl: mediaUrl,
        uploadedBy: currentUser.id,
        uploadedByName: currentUser.displayName || 'Member',
        description: description.trim() || (isPhoto ? 'Event photo' : mediaMode === 'reel' ? 'Event reel' : 'Live event recording'),
        eventId: selectedEvent.id,
        isLiveRecording: !isPhoto,
        isPhotoCapture: isPhoto,
        isReel: mediaMode === 'reel',
        filter: isPhoto ? photoFilter : videoEffect,
        autoEnhance: autoEnhance,
        textOverlay: textOverlay || null,
        duration: mediaMode !== 'photo' ? (trimEnd || recordingTime) - trimStart : null,
        createdAt: new Date(),
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0
      };

      await addDocument('media', mediaData);

      if (socialMediaOptions.instagram || socialMediaOptions.facebook) {
        shareToSocialMedia(mediaUrl, description);
      }

      const mediaType = isPhoto ? 'Photo' : mediaMode === 'reel' ? 'Reel' : 'Video';
      toast.success(`${mediaType} uploaded and shared successfully!`);
      onClose();

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error?.message || 'Failed to upload media');
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
      setUploadProgress(0);
      setIsUploading(false);
      toast.error('Upload cancelled');
    }
  };

  const shareToSocialMedia = (mediaUrl: string, description: string) => {
    if (socialMediaOptions.instagram) {
      const instagramUrl = `https://www.instagram.com/create/`;
      window.open(instagramUrl, '_blank');
    }
    
    if (socialMediaOptions.facebook) {
      const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(mediaUrl)}&quote=${encodeURIComponent(description)}`;
      window.open(facebookUrl, '_blank');
    }
    
    if (socialMediaOptions.website) {
      console.log('Media uploaded to website:', mediaUrl);
    }
  };

  const resetRecording = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (capturedPhoto) URL.revokeObjectURL(capturedPhoto);
    setMediaBlob(null);
    setPreviewUrl(null);
    setCapturedPhoto(null);
    setDescription('');
    setPhotoFilter('none');
    setCountdown(0);
    
    // Removed auto-start camera - user must manually click "Start Camera"
  };

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !video || !stream) return;

    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    let cancelled = false;

    (async () => {
      try {
        await waitForVideoReady(video);
        if (cancelled) return;
        setStreamReady(true);
        await video.play().catch(() => {
          setTimeout(() => video.play().catch(() => {}), 150);
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
      video.pause();
      video.srcObject = null;
    };
  }, [cameraOn]);

  // Removed auto-start camera on mode change
  // Camera should only start when user clicks "Start Camera" button

  // Comprehensive cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up LiveMediaUpload component');
      
      // Clear timeouts
      if (modeSwitchTimeout) clearTimeout(modeSwitchTimeout);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      
      // Release camera
      releaseCamera();
      
      // Clean up blob URLs
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      if (capturedPhoto?.startsWith('blob:')) {
        URL.revokeObjectURL(capturedPhoto);
      }
    };
  }, [modeSwitchTimeout, releaseCamera, previewUrl, capturedPhoto]);

  useEffect(() => {
    return () => releaseCamera();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Live Media Upload</h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => switchMode('reel')}
                disabled={isModeSwitching || isRecording}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  mediaMode === 'reel' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-gray-900'
                } ${isModeSwitching || isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Music className="w-4 h-4 inline mr-1" />
                Reel
              </button>
              <button
                onClick={() => switchMode('video')}
                disabled={isModeSwitching || isRecording}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  mediaMode === 'video' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-gray-900'
                } ${isModeSwitching || isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Video className="w-4 h-4 inline mr-1" />
                Video
              </button>
              <button
                onClick={() => switchMode('photo')}
                disabled={isModeSwitching || isRecording}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  mediaMode === 'photo' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-gray-900'
                } ${isModeSwitching || isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Camera className="w-4 h-4 inline mr-1" />
                Photo
              </button>
            </div>
            {devices.length > 0 && (
              <div className="ml-3 relative">
                <div className="flex items-center gap-2 mb-1">
                  <Camera className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-600">Camera</span>
                  {cameraOn && streamReady && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-600 font-medium">Live</span>
                    </div>
                  )}
                </div>
                <select
                  className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200 cursor-pointer"
                  value={deviceId || ''}
                  disabled={isRecording}
                  onChange={(e) => {
                    const newDeviceId = e.target.value || undefined;
                    if (isRecording) {
                      if (!window.confirm('Recording in progress. Stop and switch camera?')) return;
                      stopRecording();
                    }
                    setIsStartingCamera(true);
                    setDeviceId(newDeviceId);
                    releaseCamera();
                    setTimeout(() => startPreview(mediaMode), 100);
                  }}
                >
                  <option value="">📹 Default Camera</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      📷 {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </div>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!previewUrl ? (
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg overflow-hidden relative shadow-2xl">
                {cameraOn ? (
                  <div className="relative w-full h-full transition-all duration-300 ease-in-out">
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover transition-opacity duration-300"
                      onLoadedMetadata={() => {
                        console.log('📺 Video dimensions:', {
                          width: videoRef.current?.videoWidth,
                          height: videoRef.current?.videoHeight,
                        });
                      }}
                    />
                    {cameraOn && !streamReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                        <div className="text-center text-white">
                          <div className="w-20 h-20 bg-[#F25129] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse shadow-lg">
                            <Camera className="w-10 h-10 text-white animate-bounce" />
                          </div>
                          <p className="text-lg font-medium mb-2">Starting camera...</p>
                          <p className="text-sm text-gray-300">Please allow camera access</p>
                          <div className="mt-4 flex justify-center">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse mx-1" />
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse mx-1" style={{ animationDelay: '0.2s' }} />
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse mx-1" style={{ animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    {isRecording && (
                      <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium shadow-lg">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        REC {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                    {isRecording && (
                      <div className="absolute top-4 right-4 w-20 h-1 bg-gray-200 rounded-full">
                        <div
                          className="h-full bg-red-600 rounded-full"
                          style={{ width: `${(recordingTime / maxRecordingTime) * 100}%` }}
                        />
                      </div>
                    )}
                    {countdown > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-9xl font-bold">
                        {countdown}
                      </div>
                    )}
                    {isFlashing && (
                      <div className="absolute inset-0 bg-white opacity-70 transition-opacity duration-200" />
                    )}
                    {/* Recording controls moved below camera preview for better UX */}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    {isStartingCamera ? (
                      <>
                        <Loader2 className="w-16 h-16 mb-4 animate-spin" />
                        <p className="text-lg font-medium">Starting camera...</p>
                      </>
                    ) : (
                      <>
                        <Camera className="w-16 h-16 mb-4" />
                        <p className="text-lg font-medium mb-2">
                          {mediaMode === 'photo' ? 'Ready to capture' : 'Ready to record'}
                        </p>
                        <p className="text-sm text-center mb-4">
                          {mediaMode === 'photo'
                            ? 'Press the button to take a photo'
                            : `Press the button to start ${mediaMode === 'reel' ? 'reel' : 'recording'}`}
                        </p>
                        
                        <button
                          onClick={() => startPreview(mediaMode)}
                          disabled={isStartingCamera}
                          className="px-6 py-3 bg-[#F25129] hover:bg-[#E0451F] text-white font-semibold rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                        >
                          {isStartingCamera ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                              Starting...
                            </>
                          ) : (
                            <>
                              <Camera className="w-4 h-4 mr-2 inline" />
                              Start Camera
                            </>
                          )}
                        </button>
                        {location.protocol !== 'https:' && !location.hostname.includes('localhost') && (
                          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-sm text-red-300">
                            <p className="font-medium">⚠️ Camera Access Blocked:</p>
                            <p>Camera requires HTTPS or localhost. You're using: <span className="font-mono">{location.hostname}</span></p>
                            <p className="font-mono text-xs mt-1">✅ Use: http://localhost:5175</p>
                          </div>
                        )}
                        { /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && (
                          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-300">
                            <p className="font-medium">📱 Mobile Tips:</p>
                            <p>• Allow camera permissions</p>
                            <p>• Use HTTPS</p>
                            <p>• Close other camera apps</p>
                          </div>
                        )}
                        {permissionState === 'denied' && (
                          <div className="mt-4 text-center">
                            <p className="text-sm text-gray-600 mb-2">Camera denied. Upload file:</p>
                            <label className="inline-flex items-center gap-2 text-sm cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
                              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFilePicker} />
                              <Upload className="w-4 h-4" />
                              <span>Choose File</span>
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {/* Enhanced Controls */}
              {streamReady && (
                <div className="space-y-4">
                  {/* Duration selector moved to pre-camera area for better UX */}

                  {/* Photo-specific controls */}
                  {mediaMode === 'photo' && (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">Keep Camera Active:</label>
                        <button
                          onClick={() => setKeepCameraActive(!keepCameraActive)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            keepCameraActive ? 'bg-[#F25129]' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              keepCameraActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">
                        {keepCameraActive ? 'Stay on for quick shots (more battery)' : 'Off after shot (save battery)'}
                      </div>
                    </>
                  )}

                  {/* Photo Filters */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      {mediaMode === 'photo' ? 'Photo Filters:' : 'Video Effects:'}
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {[
                        { id: 'none', name: 'None', preview: 'bg-gray-100' },
                        { id: 'grayscale', name: 'B&W', preview: 'bg-gray-400' },
                        { id: 'sepia', name: 'Sepia', preview: 'bg-yellow-600' },
                        { id: 'vintage', name: 'Vintage', preview: 'bg-orange-400' },
                        { id: 'bright', name: 'Bright', preview: 'bg-yellow-200' },
                      ].map((filter) => (
                        <button
                          key={filter.id}
                          onClick={() => {
                            if (mediaMode === 'photo') {
                              setPhotoFilter(filter.id);
                            } else {
                              setVideoEffect(filter.id);
                            }
                          }}
                          className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (mediaMode === 'photo' ? photoFilter : videoEffect) === filter.id 
                              ? 'bg-[#F25129] text-white' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full ${filter.preview} mr-2 inline-block`} />
                          {filter.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto Enhance Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">Auto Enhance:</label>
                    <button
                      onClick={() => setAutoEnhance(!autoEnhance)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoEnhance ? 'bg-[#F25129]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoEnhance ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Text Overlay */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Text Overlay:</label>
                    <input
                      type="text"
                      value={textOverlay}
                      onChange={(e) => setTextOverlay(e.target.value)}
                      placeholder="Add text to your media..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {mediaBlob?.type.startsWith('image/') ? (
                  <img src={previewUrl || ''} alt="Captured photo" className="w-full h-full object-cover" />
                ) : (
                  <video src={previewUrl || undefined} controls className="w-full h-full object-cover" />
                )}
              </div>
              {/* Media Info */}
              {(mediaMode === 'photo' && photoFilter !== 'none') && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="font-medium">Filter:</span>
                  <span className="capitalize">{photoFilter}</span>
                </div>
              )}
              
              {(mediaMode !== 'photo' && videoEffect !== 'none') && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="font-medium">Effect:</span>
                  <span className="capitalize">{videoEffect}</span>
                </div>
              )}
            </div>
          )}

          {/* Duration Selector and Controls - Always visible below camera preview */}
          {cameraOn && (
            <div className="space-y-4">
              {/* Duration Selector for Video/Reel modes */}
              {mediaMode !== 'photo' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Recording Duration:</label>
                  <select
                    value={maxRecordingTime}
                    onChange={(e) => setMaxRecordingTime(Number(e.target.value))}
                    disabled={isRecording}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value={15}>15s (Short)</option>
                    <option value={30}>30s (Reel)</option>
                    <option value={60}>60s (Full)</option>
                  </select>
                </div>
              )}
              
              {/* Recording Controls */}
              <div className="flex justify-center gap-4">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-2"
                  >
                    <Square className="w-5 h-5" />
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={handleStartClick}
                    disabled={isStartingCamera || isModeSwitching || countdown > 0}
                    className={`px-6 py-3 font-semibold rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-2 ${
                      isStartingCamera || isModeSwitching || countdown > 0
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : 'bg-[#F25129] hover:bg-[#E0451F] text-white'
                    }`}
                  >
                    {isStartingCamera || countdown > 0 ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {countdown > 0 ? `Starting in ${countdown}...` : 'Starting...'}
                      </>
                    ) : mediaMode === 'photo' ? (
                      <>
                        <Camera className="w-5 h-5" />
                        Take Photo
                      </>
                    ) : (
                      <>
                        <Video className="w-5 h-5" />
                        Start Recording
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Video Trimming Controls */}
          {mediaMode !== 'photo' && previewUrl && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Trim Video:</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12">Start:</span>
                  <input
                    type="range"
                    min="0"
                    max={recordingTime}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 w-8">{trimStart}s</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12">End:</span>
                  <input
                    type="range"
                    min="0"
                    max={recordingTime}
                    value={trimEnd || recordingTime}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 w-8">{trimEnd || recordingTime}s</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={resetRecording} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              {mediaMode === 'photo' ? 'Capture Again' : 'Record Again'}
            </button>
            {mediaMode === 'photo' && keepCameraActive && streamReady && (
              <button onClick={capturePhoto} className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Take Another
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent resize-none"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Event (Optional)</label>
            <EventTypeahead 
              value={selectedEvent} 
              onChange={setSelectedEvent} 
              seedEvents={events as any}
              placeholder="Search events..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Share to</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={socialMediaOptions.website}
                  onChange={(e) => setSocialMediaOptions((prev) => ({ ...prev, website: e.target.checked }))}
                  className="mr-3"
                />
                <span className="text-sm text-gray-700">Website</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={socialMediaOptions.facebook}
                  onChange={(e) => setSocialMediaOptions((prev) => ({ ...prev, facebook: e.target.checked }))}
                  className="mr-3"
                />
                <Facebook className="w-4 h-4 mr-2 text-blue-600" />
                <span className="text-sm text-gray-700">Facebook</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={socialMediaOptions.instagram}
                  onChange={(e) => setSocialMediaOptions((prev) => ({ ...prev, instagram: e.target.checked }))}
                  className="mr-3"
                />
                <Instagram className="w-4 h-4 mr-2 text-pink-600" />
                <span className="text-sm text-gray-700">Instagram</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          {isUploading ? (
            <div className="flex items-center gap-2">
              <button onClick={cancelUpload} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-[#F25129] h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <LoadingButton
              loading={isUploading}
              onClick={uploadAndShare}
              disabled={!mediaBlob}
              className="px-6 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload & Share {mediaMode === 'photo' ? 'Photo' : mediaMode === 'reel' ? 'Reel' : 'Video'}
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );
};