import React from 'react'
import { useLogging } from '../../hooks/useLogging'
import { Event } from '../../types'

interface EventCardProps {
  event: Event
  onRSVP?: (eventId: string) => void
  onView?: (eventId: string) => void
}

export const EventCardExample: React.FC<EventCardProps> = ({ event, onRSVP, onView }) => {
  const { logEventAction, logEngagement, measureCustomMetric } = useLogging()

  const handleViewEvent = () => {
    // Log the view action
    logEventAction('view', event.id, event.title)
    
    // Log engagement
    logEngagement('event_viewed', 'events', 1)
    
    // Measure performance
    measureCustomMetric('event_card_view', () => {
      onView?.(event.id)
    })
  }

  const handleRSVP = () => {
    // Log the RSVP action
    logEventAction('rsvp', event.id, event.title)
    
    // Log engagement
    logEngagement('event_rsvp', 'events', 1)
    
    // Measure performance
    measureCustomMetric('event_card_rsvp', () => {
      onRSVP?.(event.id)
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-2">{event.title}</h3>
      <p className="text-gray-600 mb-4">{event.description}</p>
      
      <div className="flex gap-2">
        <button
          onClick={handleViewEvent}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          View Details
        </button>
        
        <button
          onClick={handleRSVP}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          RSVP
        </button>
      </div>
    </div>
  )
}
