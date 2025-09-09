import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errorService } from './errorService'

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}))

describe('ErrorService', () => {
  beforeEach(() => {
    // Clear error queue before each test
    errorService.clearErrorQueue()
  })

  it('should log error with default context', () => {
    const error = new Error('Test error')
    
    errorService.logError(error)
    
    const queue = errorService.getErrorQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].message).toBe('Test error')
    expect(queue[0].severity).toBe('low')
    expect(queue[0].category).toBe('unknown')
  })

  it('should log error with custom context', () => {
    const error = new Error('Test error')
    const context = {
      component: 'TestComponent',
      userId: 'test-user',
      severity: 'high' as const,
      category: 'auth' as const,
    }
    
    errorService.logError(error, context)
    
    const queue = errorService.getErrorQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].component).toBe('TestComponent')
    expect(queue[0].userId).toBe('test-user')
    expect(queue[0].severity).toBe('high')
    expect(queue[0].category).toBe('auth')
  })

  it('should handle Firebase errors correctly', () => {
    const firebaseError = {
      code: 'auth/user-not-found',
      message: 'User not found',
    } as any
    
    errorService.handleFirebaseError(firebaseError, {
      component: 'AuthComponent',
      userId: 'test-user',
      operation: 'login',
    })
    
    const queue = errorService.getErrorQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].code).toBe('auth/user-not-found')
    expect(queue[0].severity).toBe('high')
    expect(queue[0].category).toBe('auth')
  })

  it('should handle network errors correctly', () => {
    const networkError = new Error('Network request failed')
    
    errorService.handleNetworkError(networkError, {
      component: 'ApiComponent',
      userId: 'test-user',
      url: 'https://api.example.com',
    })
    
    const queue = errorService.getErrorQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].message).toBe('Network request failed')
    expect(queue[0].severity).toBe('medium')
    expect(queue[0].category).toBe('network')
  })

  it('should handle validation errors correctly', () => {
    const validationError = new Error('Invalid input')
    
    errorService.handleValidationError(validationError, {
      component: 'FormComponent',
      userId: 'test-user',
      field: 'email',
    })
    
    const queue = errorService.getErrorQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].message).toBe('Invalid input')
    expect(queue[0].severity).toBe('low')
    expect(queue[0].category).toBe('validation')
  })

  it('should maintain queue size limit', () => {
    // Add more errors than the max queue size
    for (let i = 0; i < 150; i++) {
      errorService.logError(new Error(`Error ${i}`))
    }
    
    const queue = errorService.getErrorQueue()
    expect(queue.length).toBeLessThanOrEqual(100)
  })

  it('should clear error queue', () => {
    errorService.logError(new Error('Test error'))
    expect(errorService.getErrorQueue()).toHaveLength(1)
    
    errorService.clearErrorQueue()
    expect(errorService.getErrorQueue()).toHaveLength(0)
  })
})
