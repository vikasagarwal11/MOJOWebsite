import React from 'react';
import { EventDoc } from '../../hooks/useEvents';

interface EventSchemaProps {
  event: EventDoc;
}

export const EventSchema: React.FC<EventSchemaProps> = ({ event }) => {
  const formatDate = (date: any) => {
    if (!date) return null;
    
    try {
      // Handle Firestore Timestamp
      if (date.seconds && typeof date.seconds === 'number') {
        return new Date(date.seconds * 1000).toISOString();
      }
      // Handle Firestore Timestamp with toDate method
      if (date.toDate && typeof date.toDate === 'function') {
        return date.toDate().toISOString();
      }
      // Handle JavaScript Date
      if (date instanceof Date) {
        return date.toISOString();
      }
      // Handle timestamp number (milliseconds)
      if (typeof date === 'number') {
        return new Date(date).toISOString();
      }
      // Handle timestamp string
      if (typeof date === 'string') {
        return new Date(date).toISOString();
      }
    } catch (error) {
      console.warn('Error formatting date for schema:', error);
    }
    
    return null;
  };

  const startDate = formatDate(event.startAt);
  const endDate = formatDate(event.endAt);

  if (!startDate) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": event.title,
    "description": event.description || `Join MOJO for ${event.title} in ${event.location || 'Short Hills, NJ'}`,
    "startDate": startDate,
    "endDate": endDate || startDate,
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": {
      "@type": "Place",
      "name": event.location || "Short Hills, NJ",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Short Hills",
        "addressRegion": "NJ",
        "addressCountry": "US"
      }
    },
    "organizer": {
      "@type": "Organization",
      "name": "Moms Fitness Mojo",
      "url": "https://momfitnessmojo.web.app"
    },
    "isAccessibleForFree": true,
    "maximumAttendeeCapacity": event.maxCapacity || 100,
    "image": event.imageUrl || "https://momfitnessmojo.web.app/assets/logo/facebook-post.svg"
  };

  return (
    <script 
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};
