import React from 'react';
import { X } from 'lucide-react';
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

  if (isCompact) {
    return (
      <motion.div 
        className="bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white p-3 rounded-t-lg"
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
            
            {/* Meta row - Icons + text, allow wrap */}
            <div className="flex flex-wrap gap-3 mt-1 text-xs opacity-90">
              <div className="flex items-center gap-1">
                <span>📅</span>
                <span>{dateLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>🕐</span>
                <span className="line-clamp-1">{timeWithDuration}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>📍</span>
                <span className="line-clamp-1">{event.venueName || 'TBD'}</span>
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
      className="bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white p-6 rounded-t-lg"
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
            <div className="flex items-center gap-2">
              <span>📍</span>
              <span>{event.venueName || 'TBD'}</span>
              {event.venueAddress && (
                <span className="text-orange-100">- {event.venueAddress}</span>
              )}
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
