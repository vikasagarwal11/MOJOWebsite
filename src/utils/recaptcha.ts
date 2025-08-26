/**
 * reCAPTCHA v2 Configuration Utility
 * Prevents Enterprise probing and ensures v2-only usage
 */

declare global {
  interface Window {
    grecaptcha: any;
    recaptchaOptions: any;
  }
}

/**
 * Configure reCAPTCHA to use v2 only and prevent Enterprise probing
 */
export function configureRecaptchaV2(): void {
  if (typeof window === 'undefined') return;

  // Set global options to force v2
  window.recaptchaOptions = {
    version: 'v2',
    enterprise: false
  };

  // Wait for grecaptcha to be available
  const checkGrecaptcha = () => {
    if (window.grecaptcha) {
      // Disable Enterprise features if they exist
      if (window.grecaptcha.enterprise) {
        console.log('🔒 reCAPTCHA: Disabling Enterprise to prevent warnings');
        window.grecaptcha.enterprise = undefined;
      }
      
      // Ensure v2 is the only available version
      if (window.grecaptcha.ready) {
        const originalReady = window.grecaptcha.ready;
        window.grecaptcha.ready = (callback: Function) => {
          console.log('🔒 reCAPTCHA: Using v2 only');
          callback();
        };
      }
      
      console.log('✅ reCAPTCHA: Configured for v2 only');
    } else {
      // Check again in a moment if not ready
      setTimeout(checkGrecaptcha, 100);
    }
  };

  // Check immediately
  checkGrecaptcha();
}

/**
 * Check if reCAPTCHA v2 is properly configured
 */
export function isRecaptchaV2Ready(): boolean {
  if (typeof window === 'undefined') return false;
  
  return !!(
    window.grecaptcha &&
    !window.grecaptcha.enterprise &&
    window.grecaptcha.render
  );
}

/**
 * Get reCAPTCHA v2 configuration for Firebase Auth
 */
export function getRecaptchaV2Config() {
  return {
    size: 'invisible' as const,
    callback: () => console.log('🔒 reCAPTCHA: Callback executed'),
    'expired-callback': () => console.log('🔒 reCAPTCHA: Expired callback executed')
  };
}
