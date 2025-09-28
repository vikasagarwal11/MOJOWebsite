import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEventDates } from '../hooks/useEventDates';
import { EventDoc } from '../../../../hooks/useEvents';

interface HeaderProps {
  event: EventDoc;
  onClose: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement>;
  isCompact?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  event, 
  onClose, 
  closeBtnRef,
  isCompact = false 
}) => {
  const { dateLabel, timeWithDuration } = useEventDates(event);

  // Helper function to generate map URL
  const getMapUrl = (address: string) => {
    // Use Google Maps as the default (works on all platforms)
    const encodedAddress = encodeURIComponent(address);
    return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  };

  // Handle address click
  const handleAddressClick = (address: string) => {
    const mapUrl = getMapUrl(address);
    window.open(mapUrl, '_blank', 'noopener,noreferrer');
  };

  // Smart display logic for venue information
  const getDisplayVenueInfo = (venueName: string, venueAddress: string, isMobile: boolean) => {
    if (!venueAddress && !venueName) return 'TBD';
    
    // If we have both venue name and address
    if (venueName && venueAddress) {
      if (isMobile) {
        // Mobile: Prioritize address, show venue name if space permits
        return venueAddress;
      } else {
        // Desktop: Show venue name + address
        return `${venueName} - ${venueAddress}`;
      }
    }
    
    // Fallback to whatever is available
    return venueAddress || venueName;
  };

  if (isCompact) {
    return (
      <motion.div 
        className="bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white p-3 rounded-t-lg"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Compact Mobile Header */}
        <div className="flex items-start justify-between gap-3">
          {/* Title - Single line with ellipsis */}
          <div className="flex-1 min-w-0">
            <h2 
              className="text-[clamp(16px,4vw,18px)] font-bold leading-tight line-clamp-1"
              id="rsvp-title"
            >
              {event.title}
            </h2>
            
            {/* Meta row - Single column with two rows for better mobile layout */}
            <div className="space-y-1 mt-2 text-xs opacity-90">
              {/* First row: Date and Time */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1">
                  <span>📅</span>
                  <span>{dateLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>🕐</span>
                  <span className="line-clamp-1">{timeWithDuration}</span>
                </div>
              </div>
              
              {/* Second row: Location - Smart display logic */}
              <div className="flex items-start gap-1">
                <span className="mt-0.5">📍</span>
                {(event.venueAddress || event.venueName) ? (
                  <button
                    onClick={() => handleAddressClick(event.venueAddress || event.venueName || '')}
                    className="line-clamp-2 leading-tight text-left hover:underline hover:text-orange-200 transition-colors cursor-pointer inline-flex items-center gap-1"
                    title="Click to open in maps"
                  >
                    <span>{getDisplayVenueInfo(event.venueName || '', event.venueAddress || '', true)}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-70" />
                  </button>
                ) : (
                  <span className="line-clamp-2 leading-tight">TBD</span>
                )}
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Full desktop header (existing layout)
  return (
    <motion.div 
      className="bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white p-6 rounded-t-lg"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 
            className="text-2xl font-bold mb-3 leading-tight"
            id="rsvp-title"
          >
            {event.title}
          </h2>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span>📅</span>
              <span>{dateLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🕐</span>
              <span>{timeWithDuration}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5">📍</span>
              <div className="flex flex-col">
                {(event.venueAddress || event.venueName) ? (
                  <button
                    onClick={() => handleAddressClick(event.venueAddress || event.venueName || '')}
                    className="text-left hover:underline hover:text-orange-200 transition-colors cursor-pointer inline-flex items-center gap-1"
                    title="Click to open in maps"
                  >
                    <span>{getDisplayVenueInfo(event.venueName || '', event.venueAddress || '', false)}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-70" />
                  </button>
                ) : (
                  <span>TBD</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          ref={closeBtnRef}
          onClick={onClose}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};
