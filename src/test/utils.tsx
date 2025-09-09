import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'

// Mock user for testing
export const mockUser = {
  id: 'test-user-id',
  displayName: 'Test User',
  email: 'test@example.com',
  phoneNumber: '+1234567890',
  role: 'member' as const,
  photoURL: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// Mock auth context value
export const mockAuthContext = {
  currentUser: mockUser,
  loading: false,
  listenersReady: true,
  sendVerificationCode: vi.fn(),
  verifyCode: vi.fn(),
  logout: vi.fn(),
  setupRecaptcha: vi.fn(),
}

// Custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <BrowserRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </BrowserRouter>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }

// Test data factories
export const createMockEvent = (overrides = {}) => ({
  id: 'test-event-id',
  title: 'Test Event',
  description: 'Test event description',
  startAt: new Date('2024-12-31T10:00:00Z'),
  endAt: new Date('2024-12-31T12:00:00Z'),
  location: 'Test Location',
  maxAttendees: 50,
  attendingCount: 0,
  createdBy: 'test-user-id',
  visibility: 'public' as const,
  allDay: false,
  tags: [],
  imageUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockAttendee = (overrides = {}) => ({
  id: 'test-attendee-id',
  eventId: 'test-event-id',
  userId: 'test-user-id',
  name: 'Test Attendee',
  ageGroup: 'adult' as const,
  relationship: 'self' as const,
  rsvpStatus: 'going' as const,
  attendeeType: 'primary' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockMedia = (overrides = {}) => ({
  id: 'test-media-id',
  title: 'Test Media',
  type: 'image' as const,
  url: 'https://example.com/test.jpg',
  thumbnailUrl: 'https://example.com/test-thumb.jpg',
  uploadedBy: 'test-user-id',
  isPublic: true,
  viewsCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
