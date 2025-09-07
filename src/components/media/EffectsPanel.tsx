import React from 'react';

interface EffectsPanelProps {
  mediaMode: 'reel' | 'video' | 'photo';
  photoFilter: string;
  videoEffect: string;
  autoEnhance: boolean;
  textOverlay: string;
  setPhotoFilter: (filter: string) => void;
  setVideoEffect: (effect: string) => void;
  setAutoEnhance: (enhance: boolean) => void;
  setTextOverlay: (text: string) => void;
  keepCameraActive: boolean;
  setKeepCameraActive: (active: boolean) => void;
}

const EffectsPanel: React.FC<EffectsPanelProps> = ({
  mediaMode,
  photoFilter,
  videoEffect,
  autoEnhance,
  textOverlay,
  setPhotoFilter,
  setVideoEffect,
  setAutoEnhance,
  setTextOverlay,
  keepCameraActive,
  setKeepCameraActive
}) => {
  const filters = [
    { id: 'none', name: 'None', preview: 'bg-gray-100' },
    { id: 'grayscale', name: 'B&W', preview: 'bg-gray-400' },
    { id: 'sepia', name: 'Sepia', preview: 'bg-yellow-600' },
    { id: 'vintage', name: 'Vintage', preview: 'bg-orange-400' },
    { id: 'bright', name: 'Bright', preview: 'bg-yellow-200' },
    { id: 'contrast', name: 'Contrast', preview: 'bg-blue-400' },
    { id: 'warm', name: 'Warm', preview: 'bg-red-300' },
    { id: 'cool', name: 'Cool', preview: 'bg-blue-300' }
  ];

  return (
    <div className="space-y-4">
      {/* Keep Camera Active Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Keep Camera Active:</label>
        <button
          onClick={() => setKeepCameraActive(!keepCameraActive)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            keepCameraActive ? 'bg-[#F25129]' : 'bg-gray-200'
          }`}
          aria-label="Toggle keep camera active"
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

      {/* Filters/Effects */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {mediaMode === 'photo' ? 'Photo Filters:' : 'Video Effects:'}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => mediaMode === 'photo' ? setPhotoFilter(filter.id) : setVideoEffect(filter.id)}
              className={`flex-shrink-0 p-2 rounded-lg text-sm transition-colors ${
                (mediaMode === 'photo' ? photoFilter : videoEffect) === filter.id
                  ? 'bg-[#F25129] text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              aria-label={`Apply ${filter.name} ${mediaMode === 'photo' ? 'filter' : 'effect'}`}
            >
              <div className={`w-6 h-6 rounded ${filter.preview} mr-1`} />
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
            autoEnhance ? 'bg-green-600' : 'bg-gray-200'
          }`}
          aria-label="Toggle auto enhance"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              autoEnhance ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <div className="text-xs text-gray-500">
        {autoEnhance ? 'Automatically improve brightness, contrast, and colors' : 'Manual enhancement only'}
      </div>

      {/* Text Overlay */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Text Overlay:</label>
        <input
          type="text"
          value={textOverlay}
          onChange={(e) => setTextOverlay(e.target.value.slice(0, 50))} // Limit to 50 chars
          placeholder="Add text (up to 50 chars)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
          aria-label="Text overlay input"
        />
        <div className="text-xs text-gray-500 mt-1">
          {textOverlay.length}/50 characters
        </div>
      </div>

      {/* Music Placeholder for Reels */}
      {mediaMode === 'reel' && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Music for Reel</p>
              <p className="text-xs text-gray-500">Coming soon - add background music</p>
            </div>
            <button
              disabled
              className="px-3 py-1 bg-gray-200 text-gray-500 rounded text-sm cursor-not-allowed"
            >
              Mute
            </button>
          </div>
        </div>
      )}

      {/* Current Settings Display */}
      {(photoFilter !== 'none' || videoEffect !== 'none' || autoEnhance || textOverlay) && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-sm font-medium text-blue-800 mb-1">Active Settings:</p>
          <div className="text-xs text-blue-700 space-y-1">
            {mediaMode === 'photo' && photoFilter !== 'none' && (
              <div>Filter: {filters.find(f => f.id === photoFilter)?.name}</div>
            )}
            {mediaMode !== 'photo' && videoEffect !== 'none' && (
              <div>Effect: {filters.find(f => f.id === videoEffect)?.name}</div>
            )}
            {autoEnhance && <div>Auto Enhance: ON</div>}
            {textOverlay && <div>Text: "{textOverlay}"</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default EffectsPanel;
