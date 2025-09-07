import React from 'react';
import { Camera, Video, Square, Loader2 } from 'lucide-react';
import type { Mode } from './useMediaCapture';

interface Props {
  mode: Mode;
  isRecording: boolean;
  streamReady: boolean;
  isStartingCamera: boolean;
  countdown: number;

  burstEnabled: boolean;
  onToggleBurst: () => void;

  onPrimaryStart: () => void;       // take photo or start recording
  onStopRecording: () => void;
  onStartCamera: () => void;

  maxRecordingTime: number;
  setMaxRecordingTime: (n: number) => void;

  permissionState: 'granted'|'denied'|'prompt'|'unknown';
  onFilePick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const MediaControls: React.FC<Props> = ({
  mode,
  isRecording,
  streamReady,
  isStartingCamera,
  countdown,
  burstEnabled,
  onToggleBurst,
  onPrimaryStart,
  onStopRecording,
  onStartCamera,
  maxRecordingTime,
  setMaxRecordingTime,
  permissionState,
  onFilePick,
}) => {
  return (
    <div className="space-y-4">
      {/* duration for video/reel */}
      {mode !== 'photo' && (
        <div>
          <label className="block text-sm font-medium mb-1">Recording duration</label>
          <select
            value={maxRecordingTime}
            onChange={e => setMaxRecordingTime(Number(e.target.value))}
            disabled={isRecording}
            className="border rounded px-3 py-2"
          >
            <option value={15}>15s (Short)</option>
            <option value={30}>30s (Reel)</option>
            <option value={60}>60s (Full)</option>
          </select>
        </div>
      )}

      {/* burst for photos */}
      {mode === 'photo' && (
        <button onClick={onToggleBurst} className="text-sm underline">
          {burstEnabled ? 'Disable burst' : 'Enable burst (5 shots)'}
        </button>
      )}

      {/* main button row */}
      <div className="flex items-center gap-3">
        {isRecording ? (
          <button
            onClick={onStopRecording}
            className="px-5 py-3 rounded bg-red-600 text-white flex items-center gap-2"
          >
            <Square className="w-5 h-5" /> Stop
          </button>
        ) : (
          <button
            onClick={onPrimaryStart}
            disabled={isStartingCamera || countdown > 0}
            className="px-5 py-3 rounded bg-blue-600 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {isStartingCamera ? <Loader2 className="w-5 h-5 animate-spin" /> :
              mode === 'photo' ? <Camera className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            {mode === 'photo' ? 'Take photo' : 'Start recording'}
          </button>
        )}

        <button
          onClick={onStartCamera}
          disabled={isStartingCamera}
          className="px-4 py-3 rounded border"
        >
          {isStartingCamera ? 'Starting…' : 'Start camera'}
        </button>

        {permissionState === 'denied' && (
          <label className="px-4 py-3 rounded border cursor-pointer">
            <input type="file" accept="image/*,video/*" className="hidden" onChange={onFilePick} />
            Upload file
          </label>
        )}
      </div>
    </div>
  );
};

export default MediaControls;
