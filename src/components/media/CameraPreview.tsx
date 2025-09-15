import React from 'react';

interface CameraPreviewProps {
  cameraOn: boolean;
  streamReady: boolean;
  isRecording: boolean;
  recordingTime: number;
  countdown: number;
  isFlashing: boolean;

  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;

  videoEffect: string;
  zoomLevel: number;
  onResetZoom: () => void;

  /** NEW: recorded (or picked) media preview to review */
  previewUrl?: string | null;
  /** NEW: media type to determine if preview should be image or video */
  mediaType?: 'image' | 'video';
  /** NEW: callback to clear the preview and return to live camera */
  onClearPreview?: () => void;
}

const CameraPreview: React.FC<CameraPreviewProps> = ({
  cameraOn,
  streamReady,
  isRecording,
  recordingTime,
  countdown,
  isFlashing,
  videoRef,
  canvasRef,
  videoEffect,
  zoomLevel,
  onResetZoom,
  previewUrl,
  mediaType,
  onClearPreview,
}) => {
  const showRecordedPreview = Boolean(previewUrl);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {/* Live stream - always present for camera functionality */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        style={{
          filter:
            videoEffect === 'none'
              ? undefined
              : videoEffect === 'grayscale'
              ? 'grayscale(1)'
              : videoEffect === 'sepia'
              ? 'sepia(1)'
              : videoEffect === 'vintage'
              ? 'contrast(0.9) saturate(0.9) sepia(0.2)'
              : videoEffect === 'bright'
              ? 'brightness(1.15)'
              : videoEffect === 'contrast'
              ? 'contrast(1.3)'
              : undefined,
          transform: `scale(${zoomLevel})`,
          transition: 'transform 150ms ease',
          zIndex: showRecordedPreview ? 1 : 2, // Show live stream behind preview
        }}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Recorded preview overlay (video or image) */}
      {showRecordedPreview && (
        <>
          {mediaType === 'image' ? (
            <img
              key={previewUrl!}
              src={previewUrl!}
              alt="Captured photo"
              className="absolute inset-0 h-full w-full object-contain bg-black"
              style={{ zIndex: 2 }}
            />
          ) : (
            <video
              key={previewUrl!}
              src={previewUrl!}
              controls
              playsInline
              className="absolute inset-0 h-full w-full object-contain bg-black"
              style={{ zIndex: 2 }}
            />
          )}
        </>
      )}

      {!cameraOn && !showRecordedPreview && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          <span>{streamReady ? 'Ready' : 'Start camera'}</span>
        </div>
      )}

      {/* Flash effect */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white/80 animate-pulse pointer-events-none" />
      )}

      {/* HUD */}
      {!showRecordedPreview && (
        <div className="absolute bottom-1 right-2 text-xs text-white/80">
          {isRecording ? `${recordingTime}s` : streamReady ? 'Ready' : 'Starting…'}
        </div>
      )}

      {!showRecordedPreview && zoomLevel !== 1 && (
        <button
          onClick={onResetZoom}
          className="absolute bottom-2 left-2 text-xs text-white/90 bg-black/40 px-2 py-1 rounded"
        >
          Reset zoom
        </button>
      )}

      {showRecordedPreview && onClearPreview && (
        <button
          onClick={onClearPreview}
          className="absolute top-2 right-2 text-xs text-white/90 bg-black/40 px-2 py-1 rounded hover:bg-black/60"
        >
          ✕ Clear Preview
        </button>
      )}
    </div>
  );
};

export default CameraPreview;
