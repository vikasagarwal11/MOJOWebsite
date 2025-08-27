import React, { useState, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useInView } from 'react-intersection-observer';
import { motion, AnimatePresence } from 'framer-motion';
import EventCard from './EventCard';
import { EventDoc } from '../../hooks/useEvents';

type Props = {
  events: EventDoc[];
  loading?: boolean;
  onEdit?: (e: EventDoc) => void;
  onClick?: (e: EventDoc) => void;
  emptyText?: string;
};

// Virtual scrolling item renderer
const EventItem = React.memo(({ 
  index, 
  style, 
  data, 
  onEdit, 
  onClick 
}: {
  index: number;
  style: React.CSSProperties;
  data: EventDoc[];
  onEdit?: (e: EventDoc) => void;
  onClick?: (e: EventDoc) => void;
}) => {
  const event = data[index];
  const [ref, inView] = useInView({
    threshold: 0.1,
    triggerOnce: true,
    rootMargin: '50px'
  });

  return (
    <div style={style} ref={ref} className="p-4">
      <AnimatePresence>
        {inView && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: index * 0.05
            }}
            whileHover={{ 
              y: -4, 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
            whileTap={{ scale: 0.98 }}
            className="h-full"
          >
            <EventCard 
              event={event} 
              onEdit={onEdit ? () => onEdit(event) : undefined} 
              onClick={onClick ? () => onClick(event) : undefined} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

EventItem.displayName = 'EventItem';

const EventList: React.FC<Props> = ({ events, loading, onEdit, onClick, emptyText }) => {
  const [listHeight, setListHeight] = useState(800);
  const [itemSize, setItemSize] = useState(480);

  // Responsive grid calculations
  const gridConfig = useMemo(() => {
    if (typeof window === 'undefined') return { cols: 3, itemSize: 480 };
    
    const width = window.innerWidth;
    if (width < 640) return { cols: 1, itemSize: 420 }; // sm
    if (width < 768) return { cols: 1, itemSize: 440 }; // md
    if (width < 1024) return { cols: 2, itemSize: 460 }; // lg
    if (width < 1280) return { cols: 3, itemSize: 480 }; // xl
    return { cols: 4, itemSize: 500 }; // 2xl
  }, []);

  // Update item size when grid config changes
  React.useEffect(() => {
    setItemSize(gridConfig.itemSize);
  }, [gridConfig]);

  // Calculate list height based on viewport
  React.useEffect(() => {
    const updateHeight = () => {
      const height = window.innerHeight - 300; // Account for header, search, etc.
      setListHeight(Math.max(height, 400));
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Loading skeleton with enhanced shimmer effect
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-xl shadow-lg h-[420px] overflow-hidden"
          >
            {/* Image skeleton */}
            <div className="h-32 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse" />
            
            {/* Content skeleton */}
            <div className="p-6 space-y-4">
              {/* Title skeleton */}
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
              
              {/* Description skeleton */}
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
              </div>
              
              {/* Details skeleton */}
              <div className="space-y-3">
                <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              </div>
              
              {/* Tags skeleton */}
              <div className="flex gap-2">
                <div className="h-6 bg-gray-200 rounded-full animate-pulse w-16" />
                <div className="h-6 bg-gray-200 rounded-full animate-pulse w-20" />
              </div>
              
              {/* Button skeleton */}
              <div className="h-12 bg-gray-200 rounded-lg animate-pulse mt-4" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (!events.length) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20 text-gray-500"
      >
        <div className="text-8xl mb-6">📅</div>
        <h3 className="text-2xl font-semibold text-gray-700 mb-3">{emptyText || 'No events found.'}</h3>
        <p className="text-gray-400 mb-6">Try adjusting your search or filters to discover amazing events</p>
        <div className="w-24 h-1 bg-gradient-to-r from-purple-500 to-blue-500 mx-auto rounded-full"></div>
      </motion.div>
    );
  }

  // For small lists, use regular grid with enhanced spacing
  if (events.length <= 20) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
        {events.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: index * 0.05
            }}
            whileHover={{ 
              y: -4, 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
            whileTap={{ scale: 0.98 }}
            className="h-full"
          >
            <EventCard 
              event={event} 
              onEdit={onEdit ? () => onEdit(event) : undefined} 
              onClick={onClick ? () => onClick(event) : undefined} 
            />
          </motion.div>
        ))}
      </div>
    );
  }

  // For large lists, use virtual scrolling
  return (
    <div className="relative">
      <List
        height={listHeight}
        itemCount={events.length}
        itemSize={itemSize}
        itemData={events}
        width="100%"
        className="scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-purple-100"
      >
        {({ index, style, data }) => (
          <EventItem
            index={index}
            style={style}
            data={data}
            onEdit={onEdit}
            onClick={onClick}
          />
        )}
      </List>
      
      {/* Performance indicator */}
      <div className="absolute bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs px-3 py-2 rounded-full shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          Virtual Scrolling: {events.length} events
        </div>
      </div>
    </div>
  );
};

export default EventList;
