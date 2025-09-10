import { 
  logEvent as firebaseLogEvent, 
  setUserId as fbSetUserId, 
  setUserProperties as fbSetUserProperties 
} from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { errorService } from './errorService'

export interface LogEvent {
  name: string
  parameters?: Record<string, any>
  userId?: string
  timestamp?: Date
}

export interface UserProperties {
  role?: string
  signup_date?: string
  last_active?: string
  [key: string]: any
}

export class LoggingService {
  private static instance: LoggingService
  private analytics: any = null
  private isInitialized = false
  private eventQueue: LogEvent[] = []
  private maxQueueSize = 100
  private isLogging = false // Prevent infinite recursion
  private cachedUserId: string | undefined = undefined
  private userIdCacheTime = 0
  private userIdCacheTimeout = 30000 // 30 seconds

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService()
    }
    return LoggingService.instance
  }

  /**
   * Initialize the logging service
   */
  async initialize(): Promise<void> {
    try {
      // Add analytics kill switch for better environment control
      const analyticsEnabled =
        (import.meta.env.PROD && import.meta.env.VITE_ENABLE_ANALYTICS !== 'false') ||
        import.meta.env.VITE_ENABLE_ANALYTICS === 'true';

      if (!analyticsEnabled) {
        this.isInitialized = true;
        console.log('📊 Logging service initialized (analytics disabled for this env)');
        return;
      }

      // Add measurement ID validation
      const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
      if (!measurementId || /^G-?X{4,}$/i.test(measurementId)) {
        this.isInitialized = true;
        this.analytics = null;
        console.warn('📊 Analytics skipped: missing or placeholder VITE_FIREBASE_MEASUREMENT_ID');
        return;
      }

      const { getAnalytics } = await import('firebase/analytics')
      this.analytics = getAnalytics()
      this.isInitialized = true
      
      // Process queued events
      this.processEventQueue()
      
      console.log('📊 Logging service initialized (analytics ON)')
    } catch (error) {
      // DO NOT call errorService here to avoid feedback loops
      console.warn('📊 Logging service init failed; analytics OFF:', error);
      this.isInitialized = true;
      this.analytics = null;
    }
  }

  /**
   * Log a custom event
   */
  logEvent(eventName: string, parameters: Record<string, any> = {}): void {
    // Prevent infinite recursion
    if (this.isLogging) {
      return
    }
    
    this.isLogging = true
    
    try {
      const event: LogEvent = {
        name: eventName,
        parameters: {
          ...parameters,
          timestamp: new Date().toISOString(),
          page_url: window.location.href,
          page_title: document.title,
        },
        userId: this.getCurrentUserId(),
        timestamp: new Date(),
      }

      if (this.isInitialized && this.analytics) {
        try {
          firebaseLogEvent(this.analytics, eventName, event.parameters)
        } catch (error) {
          // Don't use errorService here to avoid infinite loops
          console.warn('Failed to log event:', error)
        }
      } else {
        // Queue event if not initialized
        this.addToQueue(event)
        
        // Log to console in development
        if (import.meta.env.DEV) {
          console.log('📊 Event logged:', event)
        }
      }
    } catch (error) {
      // Silent fail to prevent infinite loops
      console.warn('Error in logging service:', error)
    } finally {
      this.isLogging = false
    }
  }

  /**
   * Set user properties
   */
  async setUserProperties(properties: UserProperties): Promise<void> {
    if (this.isInitialized && this.analytics) {
      try {
        await fbSetUserProperties(this.analytics, properties)
      } catch (error) {
        // OK to use errorService here (logger isn't involved)
        errorService.logError(error as Error, {
          component: 'LoggingService',
          severity: 'low',
          category: 'unknown',
          showToast: false,
        })
      }
    }
  }

  /**
   * Set user ID
   */
  async setUserId(userId: string): Promise<void> {
    // Update cached user ID
    this.cachedUserId = userId
    this.userIdCacheTime = Date.now()
    
    if (this.isInitialized && this.analytics) {
      try {
        await fbSetUserId(this.analytics, userId)
      } catch (error) {
        console.warn('Failed to set user ID:', error)
      }
    }
  }

  /**
   * Log page view
   */
  logPageView(pageName: string, pageTitle?: string): void {
    this.logEvent('page_view', {
      page_name: pageName,
      page_title: pageTitle || document.title,
      page_location: window.location.href,
    })
  }

  /**
   * Log user authentication events
   */
  logAuthEvent(eventType: 'login' | 'logout' | 'signup', method: string = 'phone'): void {
    this.logEvent(eventType, {
      method,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log event-related actions
   */
  logEventAction(action: 'view' | 'create' | 'edit' | 'delete' | 'rsvp' | 'cancel_rsvp', eventId: string, eventTitle?: string): void {
    this.logEvent(`event_${action}`, {
      event_id: eventId,
      event_title: eventTitle,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log media-related actions
   */
  logMediaAction(action: 'upload' | 'view' | 'like' | 'comment' | 'delete', mediaId: string, mediaType?: string): void {
    this.logEvent(`media_${action}`, {
      media_id: mediaId,
      media_type: mediaType,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log user engagement
   */
  logEngagement(action: string, category: string, value?: number): void {
    this.logEvent('user_engagement', {
      action,
      category,
      value,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log performance metrics
   */
  logPerformance(metric: string, value: number, unit: string = 'ms'): void {
    this.logEvent('performance_metric', {
      metric_name: metric,
      metric_value: value,
      metric_unit: unit,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log business metrics
   */
  logBusinessMetric(metric: string, value: number, currency?: string): void {
    this.logEvent('business_metric', {
      metric_name: metric,
      metric_value: value,
      currency,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log error events
   */
  logErrorEvent(error: Error, context: { component?: string; userId?: string; severity?: string }): void {
    this.logEvent('error_occurred', {
      error_message: error.message,
      error_stack: error.stack,
      component: context.component,
      severity: context.severity,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log user journey events
   */
  logUserJourney(step: string, journey: string, data?: Record<string, any>): void {
    this.logEvent('user_journey', {
      step,
      journey,
      ...data,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Get current user ID with caching to prevent infinite loops
   */
  private getCurrentUserId(): string | undefined {
    // SAFE: Don't call getAuth() during logging operations to prevent recursion
    if (this.isLogging) {
      return this.cachedUserId // Return cached value or undefined
    }
    
    // Return cached user ID if still valid
    if (this.cachedUserId && (Date.now() - this.userIdCacheTime) < this.userIdCacheTimeout) {
      return this.cachedUserId
    }
    
    try {
      const auth = getAuth()
      const userId = auth.currentUser?.uid
      
      // Cache the user ID
      this.cachedUserId = userId
      this.userIdCacheTime = Date.now()
      
      return userId
    } catch {
      // Return cached value if available, even if expired
      return this.cachedUserId
    }
  }

  /**
   * Add event to queue
   */
  private addToQueue(event: LogEvent): void {
    this.eventQueue.push(event)
    
    // Keep queue size manageable
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue = this.eventQueue.slice(-this.maxQueueSize)
    }
  }

  /**
   * Process queued events
   */
  private processEventQueue(): void {
    if (!this.analytics) return; // Add safety guard
    if (this.eventQueue.length === 0) return

    console.log(`📊 Processing ${this.eventQueue.length} queued events`)
    
    this.eventQueue.forEach(event => {
      try {
        firebaseLogEvent(this.analytics, event.name, event.parameters)
      } catch (error) {
        console.error('Failed to process queued event:', error)
      }
    })
    
    this.eventQueue = []
  }

  /**
   * Get event queue for debugging
   */
  getEventQueue(): LogEvent[] {
    return [...this.eventQueue]
  }

  /**
   * Clear event queue
   */
  clearEventQueue(): void {
    this.eventQueue = []
  }

  /**
   * Clear user ID cache (call when user logs out)
   */
  clearUserCache(): void {
    this.cachedUserId = undefined
    this.userIdCacheTime = 0
  }
}

// Export singleton instance
export const loggingService = LoggingService.getInstance()

// Convenience functions
export const logEvent = (eventName: string, parameters: Record<string, any> = {}) => {
  loggingService.logEvent(eventName, parameters)
}

export const logPageView = (pageName: string, pageTitle?: string) => {
  loggingService.logPageView(pageName, pageTitle)
}

export const logAuthEvent = (eventType: 'login' | 'logout' | 'signup', method: string = 'phone') => {
  loggingService.logAuthEvent(eventType, method)
}

export const logEventAction = (action: 'view' | 'create' | 'edit' | 'delete' | 'rsvp' | 'cancel_rsvp', eventId: string, eventTitle?: string) => {
  loggingService.logEventAction(action, eventId, eventTitle)
}

export const logMediaAction = (action: 'upload' | 'view' | 'like' | 'comment' | 'delete', mediaId: string, mediaType?: string) => {
  loggingService.logMediaAction(action, mediaId, mediaType)
}

export const logEngagement = (action: string, category: string, value?: number) => {
  loggingService.logEngagement(action, category, value)
}

export const logPerformance = (metric: string, value: number, unit: string = 'ms') => {
  loggingService.logPerformance(metric, value, unit)
}

export const logBusinessMetric = (metric: string, value: number, currency?: string) => {
  loggingService.logBusinessMetric(metric, value, currency)
}

export const logErrorEvent = (error: Error, context: { component?: string; userId?: string; severity?: string }) => {
  loggingService.logErrorEvent(error, context)
}

export const logUserJourney = (step: string, journey: string, data?: Record<string, any>) => {
  loggingService.logUserJourney(step, journey, data)
}
