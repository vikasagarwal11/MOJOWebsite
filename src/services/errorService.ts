import { FirebaseError } from 'firebase/app'
import { toast } from 'react-hot-toast'

export interface ErrorInfo {
  message: string
  code?: string
  stack?: string
  component?: string
  userId?: string
  timestamp: Date
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: 'auth' | 'firestore' | 'storage' | 'network' | 'validation' | 'unknown'
}

export class ErrorService {
  private static instance: ErrorService
  private errorQueue: ErrorInfo[] = []
  private maxQueueSize = 100

  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService()
    }
    return ErrorService.instance
  }

  /**
   * Log an error with automatic categorization and user notification
   */
  logError(
    error: Error | FirebaseError | unknown,
    context: {
      component?: string
      userId?: string
      severity?: ErrorInfo['severity']
      category?: ErrorInfo['category']
      showToast?: boolean
      customMessage?: string
    } = {}
  ): void {
    const errorInfo = this.createErrorInfo(error, context)
    
    // Add to queue
    this.addToQueue(errorInfo)
    
    // Show user notification if requested
    if (context.showToast !== false) {
      this.showUserNotification(errorInfo, context.customMessage)
    }
    
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('🚨 Error logged:', errorInfo)
    }
    
    // Send to external service in production
    if (import.meta.env.PROD) {
      this.sendToExternalService(errorInfo)
    }
  }

  /**
   * Handle Firebase-specific errors
   */
  handleFirebaseError(
    error: FirebaseError,
    context: {
      component?: string
      userId?: string
      operation?: string
    } = {}
  ): void {
    const severity = this.getFirebaseErrorSeverity(error.code)
    const category = this.getFirebaseErrorCategory(error.code)
    
    this.logError(error, {
      ...context,
      severity,
      category,
      showToast: true,
    })
  }

  /**
   * Handle network errors
   */
  handleNetworkError(
    error: Error,
    context: {
      component?: string
      userId?: string
      url?: string
    } = {}
  ): void {
    this.logError(error, {
      ...context,
      severity: 'medium',
      category: 'network',
      showToast: true,
      customMessage: 'Network error. Please check your connection.',
    })
  }

  /**
   * Handle validation errors
   */
  handleValidationError(
    error: Error,
    context: {
      component?: string
      userId?: string
      field?: string
    } = {}
  ): void {
    this.logError(error, {
      ...context,
      severity: 'low',
      category: 'validation',
      showToast: true,
      customMessage: error.message || 'Please check your input.',
    })
  }

  /**
   * Get error queue for debugging
   */
  getErrorQueue(): ErrorInfo[] {
    return [...this.errorQueue]
  }

  /**
   * Clear error queue
   */
  clearErrorQueue(): void {
    this.errorQueue = []
  }

  private createErrorInfo(
    error: Error | FirebaseError | unknown,
    context: {
      component?: string
      userId?: string
      severity?: ErrorInfo['severity']
      category?: ErrorInfo['category']
    }
  ): ErrorInfo {
    let message = 'An unknown error occurred'
    let code: string | undefined
    let stack: string | undefined

    if (error instanceof Error) {
      message = error.message
      stack = error.stack
    }

    if (error && typeof error === 'object' && 'code' in error) {
      code = error.code as string
    }

    return {
      message,
      code,
      stack,
      component: context.component,
      userId: context.userId,
      timestamp: new Date(),
      severity: context.severity || this.determineSeverity(error),
      category: context.category || this.determineCategory(error),
    }
  }

  private addToQueue(errorInfo: ErrorInfo): void {
    this.errorQueue.push(errorInfo)
    
    // Keep queue size manageable
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(-this.maxQueueSize)
    }
  }

  private showUserNotification(
    errorInfo: ErrorInfo,
    customMessage?: string
  ): void {
    const message = customMessage || this.getUserFriendlyMessage(errorInfo)
    
    switch (errorInfo.severity) {
      case 'critical':
        toast.error(message, { duration: 10000 })
        break
      case 'high':
        toast.error(message, { duration: 8000 })
        break
      case 'medium':
        toast.error(message, { duration: 5000 })
        break
      case 'low':
        toast.error(message, { duration: 3000 })
        break
    }
  }

  private getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    // Firebase error messages
    if (errorInfo.code) {
      switch (errorInfo.code) {
        case 'auth/user-not-found':
          return 'User account not found. Please check your credentials.'
        case 'auth/wrong-password':
          return 'Incorrect password. Please try again.'
        case 'auth/email-already-in-use':
          return 'This email is already registered. Please use a different email.'
        case 'auth/weak-password':
          return 'Password is too weak. Please choose a stronger password.'
        case 'auth/invalid-email':
          return 'Please enter a valid email address.'
        case 'auth/too-many-requests':
          return 'Too many attempts. Please try again later.'
        case 'permission-denied':
          return 'You do not have permission to perform this action.'
        case 'unavailable':
          return 'Service temporarily unavailable. Please try again later.'
        case 'unauthenticated':
          return 'Please sign in to continue.'
        default:
          return errorInfo.message
      }
    }

    // Generic error messages
    if (errorInfo.category === 'network') {
      return 'Network error. Please check your connection and try again.'
    }

    if (errorInfo.category === 'validation') {
      return 'Please check your input and try again.'
    }

    return errorInfo.message || 'Something went wrong. Please try again.'
  }

  private determineSeverity(error: unknown): ErrorInfo['severity'] {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = error.code as string
      
      if (code.includes('permission-denied') || code.includes('unauthenticated')) {
        return 'high'
      }
      
      if (code.includes('unavailable') || code.includes('timeout')) {
        return 'medium'
      }
    }

    return 'low'
  }

  private determineCategory(error: unknown): ErrorInfo['category'] {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = error.code as string
      
      if (code.startsWith('auth/')) {
        return 'auth'
      }
      
      if (code.includes('permission') || code.includes('not-found')) {
        return 'firestore'
      }
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return 'network'
    }

    return 'unknown'
  }

  private getFirebaseErrorSeverity(code: string): ErrorInfo['severity'] {
    const criticalCodes = ['auth/too-many-requests', 'permission-denied']
    const highCodes = ['auth/user-not-found', 'auth/wrong-password', 'unauthenticated']
    const mediumCodes = ['unavailable', 'timeout', 'auth/network-request-failed']
    
    if (criticalCodes.includes(code)) return 'critical'
    if (highCodes.includes(code)) return 'high'
    if (mediumCodes.includes(code)) return 'medium'
    return 'low'
  }

  private getFirebaseErrorCategory(code: string): ErrorInfo['category'] {
    if (code.startsWith('auth/')) return 'auth'
    if (code.includes('permission') || code.includes('not-found')) return 'firestore'
    if (code.includes('network') || code.includes('timeout')) return 'network'
    return 'unknown'
  }

  private sendToExternalService(errorInfo: ErrorInfo): void {
    // In production, send to external service like Sentry, LogRocket, etc.
    // For now, we'll just log to console
    console.error('Production error:', errorInfo)
    
    // Example: Send to Firebase Analytics
    // analytics.logEvent('error_occurred', {
    //   error_code: errorInfo.code,
    //   error_message: errorInfo.message,
    //   component: errorInfo.component,
    //   severity: errorInfo.severity,
    //   category: errorInfo.category,
    // })
  }
}

// Export singleton instance
export const errorService = ErrorService.getInstance()
