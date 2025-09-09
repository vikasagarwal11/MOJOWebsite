import { useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { loggingService } from '../services/loggingService'
import { performanceService } from '../services/performanceService'

export function useLogging() {
  const { currentUser } = useAuth()

  // Initialize logging services
  useEffect(() => {
    const initializeLogging = async () => {
      await loggingService.initialize()
      performanceService.initialize()
    }

    initializeLogging()
  }, [])

  // Set user properties when user changes
  useEffect(() => {
    if (currentUser) {
      loggingService.setUserId(currentUser.id)
      loggingService.setUserProperties({
        role: currentUser.role,
        signup_date: currentUser.createdAt?.toISOString(),
        last_active: new Date().toISOString(),
      })
    }
  }, [currentUser])

  // Logging functions
  const logEvent = useCallback((eventName: string, parameters: Record<string, any> = {}) => {
    loggingService.logEvent(eventName, parameters)
  }, [])

  const logPageView = useCallback((pageName: string, pageTitle?: string) => {
    loggingService.logPageView(pageName, pageTitle)
  }, [])

  const logAuthEvent = useCallback((eventType: 'login' | 'logout' | 'signup', method: string = 'phone') => {
    loggingService.logAuthEvent(eventType, method)
  }, [])

  const logEventAction = useCallback((action: 'view' | 'create' | 'edit' | 'delete' | 'rsvp' | 'cancel_rsvp', eventId: string, eventTitle?: string) => {
    loggingService.logEventAction(action, eventId, eventTitle)
  }, [])

  const logMediaAction = useCallback((action: 'upload' | 'view' | 'like' | 'comment' | 'delete', mediaId: string, mediaType?: string) => {
    loggingService.logMediaAction(action, mediaId, mediaType)
  }, [])

  const logEngagement = useCallback((action: string, category: string, value?: number) => {
    loggingService.logEngagement(action, category, value)
  }, [])

  const logPerformance = useCallback((metric: string, value: number, unit: string = 'ms') => {
    loggingService.logPerformance(metric, value, unit)
  }, [])

  const logBusinessMetric = useCallback((metric: string, value: number, currency?: string) => {
    loggingService.logBusinessMetric(metric, value, currency)
  }, [])

  const logErrorEvent = useCallback((error: Error, context: { component?: string; userId?: string; severity?: string }) => {
    loggingService.logErrorEvent(error, context)
  }, [])

  const logUserJourney = useCallback((step: string, journey: string, data?: Record<string, any>) => {
    loggingService.logUserJourney(step, journey, data)
  }, [])

  const measureCustomMetric = useCallback((name: string, fn: () => void | Promise<void>) => {
    performanceService.measureCustomMetric(name, fn)
  }, [])

  const measureAsyncMetric = useCallback(<T>(name: string, fn: () => Promise<T>): Promise<T> => {
    return performanceService.measureAsyncMetric(name, fn)
  }, [])

  return {
    logEvent,
    logPageView,
    logAuthEvent,
    logEventAction,
    logMediaAction,
    logEngagement,
    logPerformance,
    logBusinessMetric,
    logErrorEvent,
    logUserJourney,
    measureCustomMetric,
    measureAsyncMetric,
  }
}

// Hook for page view logging
export function usePageView(pageName: string, pageTitle?: string) {
  const { logPageView } = useLogging()

  useEffect(() => {
    logPageView(pageName, pageTitle)
  }, [pageName, pageTitle, logPageView])
}

// Hook for performance monitoring
export function usePerformanceMonitoring() {
  const { measureCustomMetric, measureAsyncMetric } = useLogging()

  return {
    measureCustomMetric,
    measureAsyncMetric,
  }
}
