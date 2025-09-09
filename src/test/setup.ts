import React from 'react'
import '@testing-library/jest-dom'
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test case
afterEach(() => {
  cleanup()
})

// Mock Firebase
vi.mock('../config/firebase', () => ({
  db: {},
  auth: {},
  storage: {},
}))

// Mock React Router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
  Link: ({ children, ...props }: any) => {
    const { children: _, ...restProps } = props
    return React.createElement('a', restProps, children)
  },
  BrowserRouter: ({ children }: any) => children,
  Routes: ({ children }: any) => children,
  Route: ({ children }: any) => children,
}))

// Mock Firebase Auth Context
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: null,
    loading: false,
    listenersReady: true,
    sendVerificationCode: vi.fn(),
    verifyCode: vi.fn(),
    logout: vi.fn(),
    setupRecaptcha: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}))

// Mock toast notifications
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}))

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: 'div',
    button: 'button',
    span: 'span',
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}))

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

global.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))
