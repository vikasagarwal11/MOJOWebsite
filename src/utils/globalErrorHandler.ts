import React from 'react'
import { errorService } from '../services/errorService'

export function setupGlobalErrorHandling() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
    
    errorService.logError(event.reason, {
      component: 'GlobalErrorHandler',
      severity: 'high',
      category: 'unknown',
      showToast: true,
      customMessage: 'An unexpected error occurred. Please try again.',
    })
    
    // Prevent the default browser behavior
    event.preventDefault()
  })

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error)
    
    errorService.logError(event.error, {
      component: 'GlobalErrorHandler',
      severity: 'high',
      category: 'unknown',
      showToast: true,
      customMessage: 'An unexpected error occurred. Please refresh the page.',
    })
  })

  // Handle Firebase errors globally
  window.addEventListener('firebase-error', (event: Event) => {
    const customEvent = event as CustomEvent
    const { error, context } = customEvent.detail
    
    errorService.handleFirebaseError(error, context)
  })

  // Handle network errors globally
  window.addEventListener('network-error', (event: Event) => {
    const customEvent = event as CustomEvent
    const { error, context } = customEvent.detail
    
    errorService.handleNetworkError(error, context)
  })

  // Handle validation errors globally
  window.addEventListener('validation-error', (event: Event) => {
    const customEvent = event as CustomEvent
    const { error, context } = customEvent.detail
    
    errorService.handleValidationError(error, context)
  })
}

// Utility functions to dispatch custom error events
export function dispatchFirebaseError(error: any, context: { component?: string; userId?: string; operation?: string }) {
  window.dispatchEvent(new CustomEvent('firebase-error', { detail: { error, context } }))
}

export function dispatchNetworkError(error: Error, context: { component?: string; userId?: string; url?: string }) {
  window.dispatchEvent(new CustomEvent('network-error', { detail: { error, context } }))
}

export function dispatchValidationError(error: Error, context: { component?: string; userId?: string; field?: string }) {
  window.dispatchEvent(new CustomEvent('validation-error', { detail: { error, context } }))
}

// React error boundary for async operations
export function withAsyncErrorBoundary<P extends object>(
  Component: React.ComponentType<P>
) {
  return function AsyncErrorBoundaryComponent(props: P) {
    const [error, setError] = React.useState<Error | null>(null)

    React.useEffect(() => {
      const handleAsyncError = (event: Event) => {
        const customEvent = event as CustomEvent
        setError(customEvent.detail.error)
      }

      window.addEventListener('async-error', handleAsyncError as EventListener)
      
      return () => {
        window.removeEventListener('async-error', handleAsyncError as EventListener)
      }
    }, [])

    if (error) {
      throw error
    }

    return React.createElement(Component, props)
  }
}

// Hook for handling async errors
export function useAsyncError() {
  const [, setError] = React.useState<Error | null>(null)

  const throwAsyncError = React.useCallback((error: Error) => {
    setError(() => {
      throw error
    })
  }, [])

  return throwAsyncError
}
