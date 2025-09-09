import { loggingService } from './loggingService'

export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: Date
  category: 'navigation' | 'resource' | 'paint' | 'layout' | 'custom'
}

export class PerformanceService {
  private static instance: PerformanceService
  private metrics: PerformanceMetric[] = []
  private observers: PerformanceObserver[] = []
  private isInitialized = false

  static getInstance(): PerformanceService {
    if (!PerformanceService.instance) {
      PerformanceService.instance = new PerformanceService()
    }
    return PerformanceService.instance
  }

  /**
   * Initialize performance monitoring
   */
  initialize(): void {
    if (this.isInitialized) return

    try {
      this.setupNavigationTiming()
      this.setupResourceTiming()
      this.setupPaintTiming()
      this.setupLayoutShift()
      this.setupLargestContentfulPaint()
      this.setupFirstInputDelay()
      
      this.isInitialized = true
      console.log('📊 Performance monitoring initialized')
    } catch (error) {
      console.error('Failed to initialize performance monitoring:', error)
    }
  }

  /**
   * Measure custom performance metric
   */
  measureCustomMetric(name: string, fn: () => void | Promise<void>): void {
    const start = performance.now()
    
    try {
      const result = fn()
      
      if (result instanceof Promise) {
        result.then(() => {
          const end = performance.now()
          this.recordMetric(name, end - start, 'ms', 'custom')
        }).catch(error => {
          console.error(`Custom metric ${name} failed:`, error)
        })
      } else {
        const end = performance.now()
        this.recordMetric(name, end - start, 'ms', 'custom')
      }
    } catch (error) {
      console.error(`Custom metric ${name} failed:`, error)
    }
  }

  /**
   * Measure async function performance
   */
  async measureAsyncMetric<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    
    try {
      const result = await fn()
      const end = performance.now()
      this.recordMetric(name, end - start, 'ms', 'custom')
      return result
    } catch (error) {
      const end = performance.now()
      this.recordMetric(`${name}_error`, end - start, 'ms', 'custom')
      throw error
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: PerformanceMetric['category']): PerformanceMetric[] {
    return this.metrics.filter(metric => metric.category === category)
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = []
  }

  /**
   * Setup navigation timing
   */
  private setupNavigationTiming(): void {
    if (typeof window === 'undefined' || !('performance' in window)) return

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    
    if (navigation) {
      // DNS lookup time
      this.recordMetric('dns_lookup', navigation.domainLookupEnd - navigation.domainLookupStart, 'ms', 'navigation')
      
      // TCP connection time
      this.recordMetric('tcp_connection', navigation.connectEnd - navigation.connectStart, 'ms', 'navigation')
      
      // Request/Response time
      this.recordMetric('request_response', navigation.responseEnd - navigation.requestStart, 'ms', 'navigation')
      
      // DOM processing time
      this.recordMetric('dom_processing', navigation.domComplete - navigation.domLoading, 'ms', 'navigation')
      
      // Page load time
      this.recordMetric('page_load', navigation.loadEventEnd - navigation.loadEventStart, 'ms', 'navigation')
      
      // Total page load time
      this.recordMetric('total_load_time', navigation.loadEventEnd - navigation.navigationStart, 'ms', 'navigation')
    }
  }

  /**
   * Setup resource timing
   */
  private setupResourceTiming(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource') {
            const resourceEntry = entry as PerformanceResourceTiming
            
            // Resource load time
            this.recordMetric('resource_load', resourceEntry.duration, 'ms', 'resource')
            
            // Resource size
            if (resourceEntry.transferSize) {
              this.recordMetric('resource_size', resourceEntry.transferSize, 'bytes', 'resource')
            }
          }
        })
      })
      
      observer.observe({ entryTypes: ['resource'] })
      this.observers.push(observer)
    } catch (error) {
      console.error('Failed to setup resource timing:', error)
    }
  }

  /**
   * Setup paint timing
   */
  private setupPaintTiming(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'paint') {
            const paintEntry = entry as PerformancePaintTiming
            
            if (paintEntry.name === 'first-contentful-paint') {
              this.recordMetric('first_contentful_paint', paintEntry.startTime, 'ms', 'paint')
            } else if (paintEntry.name === 'first-paint') {
              this.recordMetric('first_paint', paintEntry.startTime, 'ms', 'paint')
            }
          }
        })
      })
      
      observer.observe({ entryTypes: ['paint'] })
      this.observers.push(observer)
    } catch (error) {
      console.error('Failed to setup paint timing:', error)
    }
  }

  /**
   * Setup layout shift monitoring
   */
  private setupLayoutShift(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'layout-shift') {
            const layoutShiftEntry = entry as any
            
            if (!layoutShiftEntry.hadRecentInput) {
              this.recordMetric('layout_shift', layoutShiftEntry.value, 'score', 'layout')
            }
          }
        })
      })
      
      observer.observe({ entryTypes: ['layout-shift'] })
      this.observers.push(observer)
    } catch (error) {
      console.error('Failed to setup layout shift monitoring:', error)
    }
  }

  /**
   * Setup largest contentful paint
   */
  private setupLargestContentfulPaint(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'largest-contentful-paint') {
            this.recordMetric('largest_contentful_paint', entry.startTime, 'ms', 'paint')
          }
        })
      })
      
      observer.observe({ entryTypes: ['largest-contentful-paint'] })
      this.observers.push(observer)
    } catch (error) {
      console.error('Failed to setup largest contentful paint monitoring:', error)
    }
  }

  /**
   * Setup first input delay
   */
  private setupFirstInputDelay(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'first-input') {
            const firstInputEntry = entry as any
            this.recordMetric('first_input_delay', firstInputEntry.processingStart - firstInputEntry.startTime, 'ms', 'custom')
          }
        })
      })
      
      observer.observe({ entryTypes: ['first-input'] })
      this.observers.push(observer)
    } catch (error) {
      console.error('Failed to setup first input delay monitoring:', error)
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(name: string, value: number, unit: string, category: PerformanceMetric['category']): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      category,
    }
    
    this.metrics.push(metric)
    
    // Log to analytics
    loggingService.logPerformance(name, value, unit)
    
    // Log to console in development
    if (import.meta.env.DEV) {
      console.log(`📊 Performance metric: ${name} = ${value}${unit}`)
    }
  }

  /**
   * Cleanup observers
   */
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }
}

// Export singleton instance
export const performanceService = PerformanceService.getInstance()

// Convenience functions
export const measureCustomMetric = (name: string, fn: () => void | Promise<void>) => {
  performanceService.measureCustomMetric(name, fn)
}

export const measureAsyncMetric = <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  return performanceService.measureAsyncMetric(name, fn)
}
