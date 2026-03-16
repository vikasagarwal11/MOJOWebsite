import { ErrorInfo } from './errorService';

/**
 * Rollbar Service
 * Provides Rollbar configuration and helper methods
 * Uses @rollbar/react Provider pattern for React integration
 */
class RollbarService {
  /**
   * Get Rollbar configuration
   * Returns null if Rollbar should not be enabled
   */
  getConfig() {
    // Get Rollbar access token from environment
    const accessToken = import.meta.env.VITE_ROLLBAR_ACCESS_TOKEN;
    
    // Only initialize if token is provided
    if (!accessToken) {
      if (import.meta.env.DEV) {
        console.log('📊 Rollbar: Access token not provided, skipping initialization');
      }
      return null;
    }

    // Check if Rollbar should be enabled
    const rollbarEnabled = 
      (import.meta.env.PROD && import.meta.env.VITE_ENABLE_ROLLBAR !== 'false') ||
      import.meta.env.VITE_ENABLE_ROLLBAR === 'true';

    if (!rollbarEnabled) {
      if (import.meta.env.DEV) {
        console.log('📊 Rollbar: Disabled via environment variable');
      }
      return null;
    }

    // Get environment name
    const environment = import.meta.env.VITE_ENVIRONMENT || 
                       (import.meta.env.PROD ? 'production' : 
                        import.meta.env.MODE === 'staging' ? 'staging' : 'development');

    // Return Rollbar configuration
    return {
      accessToken,
      environment,
      captureUncaught: true,
      captureUnhandledRejections: true,
      payload: {
        client: {
          javascript: {
            source_map_enabled: true,
            code_version: import.meta.env.VITE_APP_VERSION || '1.0.0',
          },
        },
      },
      // Only capture errors in production/staging, not in dev
      enabled: environment !== 'development' || import.meta.env.VITE_ENABLE_ROLLBAR === 'true',
    };
  }

  /**
   * Map internal severity to Rollbar level
   */
  mapSeverityToLevel(severity: ErrorInfo['severity']): 'critical' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'error';
    }
  }
}

// Export singleton instance
export const rollbarService = new RollbarService();

