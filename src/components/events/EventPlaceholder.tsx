import React from 'react';

interface EventPlaceholderProps {
  className?: string;
  children?: React.ReactNode;
  aspect?: string | number;
  title?: string;
}

const EventPlaceholder: React.FC<EventPlaceholderProps> = ({ 
  className = "", 
  children,
  aspect = "16/9",
  title = "Event"
}) => {
  const style: React.CSSProperties = {
    aspectRatio: typeof aspect === "number" ? String(aspect) : aspect,
  };

  return (
    <div 
      className={`relative w-full overflow-hidden bg-gradient-to-br from-[#F25129] to-[#E04A1F] flex items-center justify-center ${className}`} 
      style={style}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
        <div className="absolute top-4 right-4 w-16 h-16 rounded-full bg-white/10"></div>
        <div className="absolute bottom-4 left-4 w-12 h-12 rounded-full bg-white/10"></div>
        <div className="absolute top-1/2 left-1/4 w-8 h-8 rounded-full bg-white/10"></div>
      </div>
      
      {/* Main Content */}
      <div className="relative z-10 text-center text-white">
        {/* Event Icon */}
        <div className="mb-3 flex justify-center">
          <svg 
            className="w-12 h-12 text-white/80" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1.5} 
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
        </div>
        
        {/* Text */}
        <div className="text-sm font-medium opacity-90 px-4 leading-tight">
          {title}
        </div>
        <div className="text-xs opacity-70 mt-2">
          📅 Event
        </div>
      </div>
      
      {/* Children overlay (for status badges, etc.) */}
      {children ? (
        <div className="absolute left-3 top-3 flex flex-wrap gap-2 z-20">{children}</div>
      ) : null}
    </div>
  );
};

export { EventPlaceholder };
