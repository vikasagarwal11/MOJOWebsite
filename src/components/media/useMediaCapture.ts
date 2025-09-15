import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

export type Mode = 'reel' | 'video' | 'photo';

export interface UseMediaCaptureReturn {
  mediaBlob: Blob | null;
  previewUrl: string | null;
  thumbnailBlob: Blob | null;
  cameraOn: boolean;
  streamReady: boolean;
  isRecording: boolean;
  recordingTime: number;
  countdown: number;
  isFlashing: boolean;
  isStartingCamera: boolean;

  // controls/effects
  photoFilter: string;
  videoEffect: string;
  autoEnhance: boolean;
  textOverlay: string;
  keepCameraActive: boolean;
  zoomLevel: number;
  supportOpticalZoom: boolean;

  // timing
  maxRecordingTime: number;
  trimStart: number;
  trimEnd: number;
  bakeVideoEffects: boolean;

  // devices
  devices: MediaDeviceInfo[];
  deviceId?: string;
  permissionState: 'granted'|'denied'|'prompt'|'unknown';

  // actions
  startPreview: (mode: Mode) => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  capturePhoto: () => Promise<void>;
  releaseCamera: () => void;
  resetRecording: () => void;
  refreshDevices: () => Promise<void>;
  applyZoom: (level: number) => Promise<void>;
  generateThumbnailFromUrl: (url: string) => Promise<void>;

  // setters
  setPhotoFilter: (s: string) => void;
  setVideoEffect: (s: string) => void;
  setAutoEnhance: (b: boolean) => void;
  setTextOverlay: (s: string) => void;
  setKeepCameraActive: (b: boolean) => void;
  setZoomLevel: (n: number) => void;
  setMaxRecordingTime: (n: number) => void;
  setTrimStart: (n: number) => void;
  setTrimEnd: (n: number) => void;
  setBakeVideoEffects: (b: boolean) => void;
  setDeviceId: (id?: string) => void;
  setCountdown: (n: number) => void;
  setMediaBlob: (blob: Blob | null) => void;
  setPreviewUrl: (url: string | null) => void;
}

export default function useMediaCapture(
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  currentMode: Mode = 'reel'
): UseMediaCaptureReturn {
  // Core state
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [streamReady, setStreamReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);

  // Media settings
  const [photoFilter, setPhotoFilter] = useState('none');
  const [videoEffect, setVideoEffect] = useState('none');
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [textOverlay, setTextOverlay] = useState('');
  const [keepCameraActive, setKeepCameraActive] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [supportOpticalZoom] = useState(false);
  const [maxRecordingTime, setMaxRecordingTime] = useState(30);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [bakeVideoEffects, setBakeVideoEffects] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [permissionState, setPermissionState] = useState<'granted'|'denied'|'prompt'|'unknown'>('unknown');

  // Refs
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startingRef = useRef(false);
  const reattachTimer = useRef<number | null>(null);
  const thumbnailBlobRef = useRef<Blob | null>(null);
  const isFallbackModeRef = useRef(false);

  // ---- Permissions / devices ----
  const checkPermissions = useCallback(async () => {
    try {
      if (!('permissions' in navigator)) {
        setPermissionState('prompt');
        return;
      }
      const p = await (navigator as any).permissions.query({ name: 'camera' as PermissionName });
      setPermissionState(p.state);
      p.onchange = () => setPermissionState(p.state);
    } catch {
      setPermissionState('prompt');
    }
  }, []);

  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter(d => d.kind === 'videoinput');
      setDevices(vids);
      if (vids.length > 0 && !deviceId) setDeviceId(vids[0].deviceId);
      console.log('📷 Available cameras:', vids.length, vids);
      console.log('📷 Current deviceId:', deviceId);
      console.log('📷 Device labels:', vids.map(d => ({ id: d.deviceId, label: d.label })));
    } catch (e) {
      console.error('❌ enumerateDevices error', e);
    }
  }, [deviceId]);

  useEffect(() => {
    checkPermissions();
    enumerateDevices();
  }, [checkPermissions, enumerateDevices]);

  useEffect(() => {
    const preferred = localStorage.getItem('preferredCamera');
    if (preferred && devices.some(d => d.deviceId === preferred)) {
      setDeviceId(preferred);
    }
  }, [devices]);

  // Restart camera when deviceId changes - will be defined after startPreview

  // ---- Ready-state helpers ----
  const markReady = useCallback(() => {
    setStreamReady(true);
    setCameraOn(true);
    setIsStartingCamera(false);
    startingRef.current = false;
  }, []);

  // ---- Attach stream to video safely ----
  const attachStreamToVideo = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    // Wait for the <video> to exist with longer timeout
    const t0 = performance.now();
    while (!videoRef.current || !(videoRef.current instanceof HTMLVideoElement)) {
      if (performance.now() - t0 > 3000) {
        console.warn('[attachStreamToVideo] video element still not ready after 3s.');
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    const video = videoRef.current;
    if (!video) {
      console.warn('[attachStreamToVideo] video element not found after waiting');
      return;
    }

    console.log('[attachStreamToVideo] video element found, attaching stream...');

    try {
      // Attach the stream
      (video as any).srcObject = stream;

      // If metadata is already present, mark ready immediately
      if (video.readyState >= 1 && (video.videoWidth > 0 || video.videoHeight > 0)) {
        markReady();
      } else {
        // Otherwise, wait for metadata OR fall back after 1.5s
        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          markReady();
        };
        video.addEventListener('loadedmetadata', onMeta);

        // Fallback timeout (handles browsers that skip the event)
        setTimeout(() => {
          if (!streamReady && streamRef.current) {
            console.warn('[attachStreamToVideo] loadedmetadata fallback fired.');
            markReady();
          }
        }, 2000);
      }

      // Try to play; ignore autoplay rejections
      const play = (video as any).play;
      if (typeof play === 'function') {
        try { await play.call(video); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('attachStreamToVideo error', err);
      setIsStartingCamera(false);
      startingRef.current = false;
    }
  }, [videoRef, streamReady, markReady]);

  // Re-attach if stream exists but <video> wasn’t ready
  useEffect(() => {
    if (!streamRef.current) return;
    if (reattachTimer.current) window.clearTimeout(reattachTimer.current);
    reattachTimer.current = window.setTimeout(() => attachStreamToVideo(), 50);
    return () => {
      if (reattachTimer.current) window.clearTimeout(reattachTimer.current);
    };
  }, [attachStreamToVideo, videoRef]);

  // ---- Camera control ----
  const releaseCamera = useCallback(() => {
    console.log('🛑 Releasing camera...');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      (videoRef.current as any).srcObject = null;
    }
    setStreamReady(false);
    setCameraOn(false);
    setIsStartingCamera(false);
    startingRef.current = false;
    console.log('✅ Camera released');
  }, [videoRef]);

  const startPreview = useCallback(async (previewMode: Mode) => {
    if (startingRef.current) {
      console.log('📹 Preview start already in progress, skipping');
      return;
    }
    if (isStartingCamera) {
      console.log('📹 Camera already starting, skipping');
      return;
    }
    if (cameraOn && streamRef.current && !deviceId) {
      console.log('📹 Camera already on and working, skipping');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera access not supported. Use HTTPS and a modern browser.');
      return;
    }

    startingRef.current = true;
    setIsStartingCamera(true);
    isFallbackModeRef.current = false;

    try {
      // If switching devices, reset
      if (streamRef.current && deviceId) {
        console.log('📷 Switching devices, releasing current camera...');
        releaseCamera();
        await new Promise(r => setTimeout(r, 120));
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // Only use facingMode if no specific deviceId is selected
          ...(deviceId ? {} : { facingMode: previewMode === 'photo' ? 'user' : 'environment' }),
        },
        audio: previewMode !== 'photo',
      };

      console.log('📷 Attempting camera with constraints:', JSON.stringify(constraints, null, 2));
      console.log('📷 Using deviceId:', deviceId);
      console.log('📷 Available devices:', devices.map(d => d.deviceId));

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (deviceId) localStorage.setItem('preferredCamera', deviceId);

      await attachStreamToVideo();

      // Safety: if attach didn’t flip it, flip here
      setIsStartingCamera(false);
      startingRef.current = false;
    } catch (error: any) {
      console.error('getUserMedia error', error);
      setIsStartingCamera(false);
      startingRef.current = false;

      const name = error?.name;
      
      if (name === 'NotFoundError') {
        // Camera device not found, try fallback approach
        console.log('🔄 Camera device not found, trying fallback...');
        
        try {
          // Try without specific device ID
          isFallbackModeRef.current = true;
          const fallbackConstraints: MediaStreamConstraints = {
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: previewMode === 'photo' ? 'user' : 'environment',
            },
            audio: previewMode !== 'photo',
          };
          
          console.log('📷 Fallback constraints:', JSON.stringify(fallbackConstraints, null, 2));
          console.log('📷 Fallback mode:', previewMode);
          
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          streamRef.current = fallbackStream;
          await attachStreamToVideo();
          setIsStartingCamera(false);
          startingRef.current = false;
          toast.success('Camera started with fallback device');
          return;
        } catch (fallbackError) {
          console.error('Fallback camera also failed:', fallbackError);
          
          // Try with absolute minimal constraints
          try {
            console.log('📷 Trying minimal constraints...');
            const minimalConstraints: MediaStreamConstraints = {
              video: true,
              audio: false
            };
            
            const minimalStream = await navigator.mediaDevices.getUserMedia(minimalConstraints);
            streamRef.current = minimalStream;
            await attachStreamToVideo();
            setIsStartingCamera(false);
            startingRef.current = false;
            toast.success('Camera started with minimal settings');
            return;
          } catch (minimalError) {
            console.error('Minimal constraints also failed:', minimalError);
          }
          
          await enumerateDevices();
          
          if (devices.length > 0) {
            setDeviceId(devices[0].deviceId);
            toast.error('Camera device changed. Please try again.');
          } else {
            toast.error('No camera found on this device.');
          }
        }
      } else {
        toast.error(
          name === 'NotAllowedError'
            ? 'Please allow camera permissions and try again.'
            : 'Camera not ready. Try again in a moment.'
        );
      }
    }
  }, [deviceId, attachStreamToVideo, releaseCamera]);

  // Note: Device changes are now handled directly in startPreview when needed
  // This prevents infinite loops from useEffect dependencies

  // Refresh devices when camera fails
  const refreshDevices = useCallback(async () => {
    console.log('🔄 Refreshing camera devices...');
    await enumerateDevices();
  }, [enumerateDevices]);


  // ---- Recording (define stop first so start can reference it safely) ----
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      console.log('🛑 Recording stopped');
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (!streamRef.current || isRecording) return;

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        bitsPerSecond: 2_000_000,
      });

      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        setMediaBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        generateThumbnail(blob);
        setIsRecording(false);
        setRecordingTime(0);
        console.log('✅ Recording stopped, blob created:', blob.size, 'bytes');
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      const startTime = Date.now();
      const tick = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);
        if (elapsed >= maxRecordingTime) {
          stopRecording();
          toast.success('Maximum recording time reached');
        } else {
          recordingTimerRef.current = setTimeout(tick, 1000);
        }
      };
      recordingTimerRef.current = setTimeout(tick, 1000);

      console.log('🎬 Recording started');
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      toast.error('Failed to start recording');
    }
  }, [isRecording, maxRecordingTime, stopRecording]);

  // ---- Photo capture ----
  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) {
      toast.error('Camera not ready for photo capture');
      return;
    }

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    try {
      if (video.readyState < 2) {
        await new Promise<void>(resolve => {
          const onReady = () => {
            video.removeEventListener('loadedmetadata', onReady);
            resolve();
          };
          video.addEventListener('loadedmetadata', onReady);
        });
      }
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        toast.error('Camera not ready');
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0);

      if (photoFilter !== 'none') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          switch (photoFilter) {
            case 'grayscale': {
              const gray = r * 0.299 + g * 0.587 + b * 0.114;
              data[i] = data[i + 1] = data[i + 2] = gray;
              break;
            }
            case 'sepia':
              data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
              data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
              data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
              break;
            case 'vintage':
              data[i] = Math.min(255, r * 1.1);
              data[i + 1] = Math.min(255, g * 1.0);
              data[i + 2] = Math.min(255, b * 0.9);
              break;
            case 'bright':
              data[i] = Math.min(255, r * 1.2);
              data[i + 1] = Math.min(255, g * 1.2);
              data[i + 2] = Math.min(255, b * 1.2);
              break;
            case 'contrast': {
              const factor = 1.5;
              data[i] = Math.min(255, Math.max(0, (r - 128) * factor + 128));
              data[i + 1] = Math.min(255, Math.max(0, (g - 128) * factor + 128));
              data[i + 2] = Math.min(255, Math.max(0, (b - 128) * factor + 128));
              break;
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }

      if (textOverlay) {
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.strokeText(textOverlay, canvas.width / 2, canvas.height - 50);
        ctx.fillText(textOverlay, canvas.width / 2, canvas.height - 50);
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        setMediaBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        console.log('📸 Photo captured:', blob.size, 'bytes');
        toast.success('Photo captured!');
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.error('❌ Error capturing photo:', err);
      toast.error('Failed to capture photo');
    }
  }, [photoFilter, textOverlay, videoRef]);

  // ---- Thumbnail generation ----
  const generateThumbnail = useCallback((videoBlob: Blob) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.currentTime = 1;
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 320, 180);
      canvas.toBlob(b => {
        if (b) {
          thumbnailBlobRef.current = b;
          setThumbnailBlob(b);
          console.log('🖼️ Thumbnail generated');
        }
      }, 'image/jpeg', 0.8);
    };
  }, []);

  const generateThumbnailFromUrl = useCallback(async (_url: string) => {
    /* optional: implement later */
  }, []);

  // ---- Reset / cleanup ----
  const resetRecording = useCallback(() => {
    setMediaBlob(null);
    setPreviewUrl(null);
    setRecordingTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    console.log('🔄 Recording reset');
  }, [previewUrl]);

  // Countdown (if you use it elsewhere)
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up useMediaCapture hook');
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      releaseCamera();
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [releaseCamera, previewUrl]);

  // Wrapper functions that check recording state
  const safeSetPhotoFilter = useCallback((filter: string) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change photo filter during recording');
      return;
    }
    setPhotoFilter(filter);
  }, [isRecording, setPhotoFilter]);

  const safeSetVideoEffect = useCallback((effect: string) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change video effect during recording');
      return;
    }
    setVideoEffect(effect);
  }, [isRecording, setVideoEffect]);

  const safeSetAutoEnhance = useCallback((enhance: boolean) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change auto enhance during recording');
      return;
    }
    setAutoEnhance(enhance);
  }, [isRecording, setAutoEnhance]);

  const safeSetTextOverlay = useCallback((text: string) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change text overlay during recording');
      return;
    }
    setTextOverlay(text);
  }, [isRecording, setTextOverlay]);

  const safeSetKeepCameraActive = useCallback((active: boolean) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change keep camera active during recording');
      return;
    }
    setKeepCameraActive(active);
  }, [isRecording, setKeepCameraActive]);

  const safeSetZoomLevel = useCallback((level: number) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change zoom level during recording');
      return;
    }
    setZoomLevel(level);
  }, [isRecording, setZoomLevel]);

  const safeSetDeviceId = useCallback((id?: string) => {
    if (isRecording) {
      console.warn('⚠️ Cannot change device during recording');
      return;
    }
    setDeviceId(id);
  }, [isRecording, setDeviceId]);

  return {
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
    supportOpticalZoom,

    maxRecordingTime,
    trimStart,
    trimEnd,
    bakeVideoEffects,

    devices,
    deviceId,
    permissionState,

    startPreview,
    startRecording,
    stopRecording,
    capturePhoto,
    releaseCamera,
    resetRecording,
    refreshDevices,
    applyZoom: async (level: number) => setZoomLevel(Math.min(3, Math.max(1, level))),
    generateThumbnailFromUrl,

    setPhotoFilter: safeSetPhotoFilter,
    setVideoEffect: safeSetVideoEffect,
    setAutoEnhance: safeSetAutoEnhance,
    setTextOverlay: safeSetTextOverlay,
    setKeepCameraActive: safeSetKeepCameraActive,
    setZoomLevel: safeSetZoomLevel,
    setMaxRecordingTime,
    setTrimStart,
    setTrimEnd,
    setBakeVideoEffects,
    setDeviceId: safeSetDeviceId,
    setCountdown,
    setMediaBlob,
    setPreviewUrl,
  };
}
