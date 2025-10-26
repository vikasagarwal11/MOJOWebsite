import React, { Component, ErrorInfo, ReactNode, ComponentType } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ErrorBoundary caught error:', error);
    console.error('🚨 ErrorBoundary errorInfo:', errorInfo);
    
    // Log to our error service
    if (window.loggingService) {
      window.loggingService.logErrorEvent(error, {
        component: 'ErrorBoundary',
        errorInfo: errorInfo.componentStack,
        severity: 'critical'
      });
    }
    
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-red-800 font-semibold">Something went wrong</h2>
          <p className="text-red-600 mt-2">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <details className="mt-4 text-sm text-red-500">
            <summary>Error Details</summary>
            <pre className="mt-2 whitespace-pre-wrap">
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// Safe wrapper for any component
export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  fallback?: ReactNode
): ComponentType<P> {
  // Assign a display name for better debugging
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}