import { describe, it, expect } from 'vitest'
import { render, screen } from '../../test/utils'
import { LoadingSpinner } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders loading spinner with default text', () => {
    render(<LoadingSpinner />)
    
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders loading spinner with custom text', () => {
    const customText = 'Please wait...'
    render(<LoadingSpinner text={customText} />)
    
    expect(screen.getByText(customText)).toBeInTheDocument()
  })

  it('renders with correct accessibility attributes', () => {
    render(<LoadingSpinner />)
    
    const spinner = screen.getByRole('status')
    expect(spinner).toHaveAttribute('aria-live', 'polite')
    expect(spinner).toHaveAttribute('aria-label', 'Loading')
  })

  it('applies custom className when provided', () => {
    const customClass = 'custom-spinner-class'
    render(<LoadingSpinner className={customClass} />)
    
    const spinner = screen.getByRole('status')
    expect(spinner).toHaveClass(customClass)
  })
})
