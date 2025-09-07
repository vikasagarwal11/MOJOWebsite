import React from 'react';

interface Props {
  recordingTime: number;
  trimStart: number;
  trimEnd: number;
  setTrimStart: (n: number) => void;
  setTrimEnd: (n: number) => void;
}

const TrimEditor: React.FC<Props> = ({ recordingTime, trimStart, trimEnd, setTrimStart, setTrimEnd }) => {
  const onStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setTrimStart(Math.min(v, trimEnd));
  };
  const onEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setTrimEnd(Math.max(v, trimStart));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Trim ({recordingTime}s total)</label>
      <div className="flex items-center gap-2">
        <span className="text-xs w-12">Start: {trimStart}s</span>
        <input type="range" min={0} max={recordingTime} value={trimStart} onChange={onStart} className="flex-1" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs w-12">End: {trimEnd}s</span>
        <input type="range" min={0} max={recordingTime} value={trimEnd} onChange={onEnd} className="flex-1" />
      </div>
      <button className="text-sm text-blue-600" onClick={() => { setTrimStart(0); setTrimEnd(recordingTime); }}>
        Reset
      </button>
    </div>
  );
};

export default TrimEditor;
