import React from "react";
import { motion } from "framer-motion";
import { EventDoc } from "../../hooks/useEvents";
import EventCardV2 from "./EventCardV2";

type Props = {
  events: EventDoc[];
  loading?: boolean;
  emptyText?: string;
  /** Route builder for V2 detail page */
  buildDetailsPath: (eventId: string) => string;
};

export default function EventListV2({ events, loading, emptyText, buildDetailsPath }: Props) {
  // Ensure events is always an array
  const safeEvents = Array.isArray(events) ? events : [];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="h-44 bg-gray-200 animate-pulse" />
            <div className="p-5 space-y-3">
              <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
              <div className="h-10 bg-gray-100 rounded-xl animate-pulse mt-4" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (!safeEvents || !safeEvents.length) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📅</div>
        <h3 className="text-xl font-semibold text-gray-800">{emptyText || "No events found."}</h3>
        <p className="text-gray-500 mt-2">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
      {safeEvents.map((event, idx) => {
        if (!event || !(event as any).id) return null;
        return (
          <motion.div
            key={(event as any).id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.03, 0.25) }}
            className="h-full"
          >
            <EventCardV2 event={event} toDetails={buildDetailsPath((event as any).id)} />
          </motion.div>
        );
      })}
    </div>
  );
}

