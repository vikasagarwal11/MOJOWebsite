/**
 * reCAPTCHA Configuration Utility
 * Supports both v2 and Enterprise based on environment
 */

declare global {
  interface Window {
    grecaptcha: any;
    recaptchaOptions: any;
  }
}

/**
 * Configure reCAPTCHA based on environment settings
 */
export function configureRecaptcha(): void {
  if (typeof window === 'undefined') return;

  // Safety: never enable custom/Enterprise reCAPTCHA config during local dev.
  // Firebase Phone Auth handles its own app-verifier on web; injecting enterprise.js or
  // window.recaptchaOptions in dev can cause hard-to-debug Phone Auth failures.
  const configuredVersion = import.meta.env.VITE_RECAPTCHA_VERSION || 'v2';
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const version = (import.meta.env.DEV || isLocalhost) ? 'v2' : configuredVersion;

  // IMPORTANT:
  // Firebase Phone Auth manages its own reCAPTCHA v2 widget + site key.
  // Setting window.recaptchaOptions/siteKey or pre-loading scripts can break Phone Auth
  // and trigger "INVALID_APP_CREDENTIAL" / "auth/invalid-app-credential".
  if (version !== 'enterprise') {
    try {
      // Ensure we don't leak a previous enterprise config into dev.
      delete (window as any).recaptchaOptions;
    } catch {
      // ignore
    }
    console.log('✅ reCAPTCHA: Skipping custom config (Firebase Phone Auth handles v2)');
    return;
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    console.warn('⚠️ reCAPTCHA: Enterprise mode selected but no site key found');
    return;
  }

  // Set global options (enterprise only)
  window.recaptchaOptions = {
    enterprise: true,
  };

  // Load the Enterprise script if not already loaded
  loadRecaptchaScript('enterprise', siteKey);
}

/**
 * Load reCAPTCHA script dynamically
 */
function loadRecaptchaScript(version: string, siteKey: string): void {
  // Check if script is already loaded
  if (window.grecaptcha) {
    console.log('✅ reCAPTCHA: Script already loaded');
    return;
  }

  // Check if script tag already exists
  const existingScript = document.querySelector('script[src*="recaptcha"]');
  if (existingScript) {
    console.log('✅ reCAPTCHA: Script tag already exists, waiting for load...');
    waitForRecaptchaLoad(version);
    return;
  }

  // Create and load the script
  const script = document.createElement('script');
  script.async = true;
  script.defer = true;
  
  if (version === 'enterprise') {
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`;
    console.log('🔄 reCAPTCHA: Loading Enterprise script...');
  } else {
    // v2 widgets require explicit rendering (grecaptcha.render).
    // NOTE: Firebase Phone Auth uses reCAPTCHA v2 internally and does not require a site key,
    // but loading the wrong script (v3 style) can interfere with the widget.
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    console.log('🔄 reCAPTCHA: Loading v2 (explicit) script...');
  }

  script.onload = () => {
    console.log('✅ reCAPTCHA: Script loaded successfully');
    waitForRecaptchaLoad(version);
  };

  script.onerror = () => {
    console.error('❌ reCAPTCHA: Failed to load script');
  };

  document.head.appendChild(script);
}

/**
 * Wait for reCAPTCHA to be ready
 */
function waitForRecaptchaLoad(version: string): void {
  const checkGrecaptcha = () => {
    if (window.grecaptcha) {
      if (version === 'enterprise') {
        console.log('✅ reCAPTCHA: Enterprise ready');
      } else {
        console.log('✅ reCAPTCHA: v2 ready');
      }
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
 * Check if reCAPTCHA is ready (v2 or Enterprise)
 */
export function isRecaptchaReady(): boolean {
  if (typeof window === 'undefined') return false;
  
  const version = import.meta.env.VITE_RECAPTCHA_VERSION || 'v2';
  
  if (version === 'enterprise') {
    return !!(window.grecaptcha && window.grecaptcha.enterprise && window.grecaptcha.enterprise.ready);
  } else {
    return !!(window.grecaptcha && window.grecaptcha.render);
  }
}

/**
 * Execute reCAPTCHA Enterprise with action
 */
export async function executeRecaptchaEnterprise(action: string = 'LOGIN'): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    console.error('❌ reCAPTCHA: No site key found');
    return null;
  }

  if (!window.grecaptcha || !window.grecaptcha.enterprise) {
    console.error('❌ reCAPTCHA: Enterprise not available');
    return null;
  }

  try {
    return new Promise((resolve, reject) => {
      window.grecaptcha.enterprise.ready(async () => {
        try {
          const token = await window.grecaptcha.enterprise.execute(siteKey, { action });
          console.log(`✅ reCAPTCHA: Enterprise token generated for action: ${action}`);
          resolve(token);
        } catch (error) {
          console.error('❌ reCAPTCHA: Enterprise execution failed:', error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('❌ reCAPTCHA: Enterprise ready failed:', error);
    return null;
  }
}

/**
 * Get reCAPTCHA configuration for Firebase Auth
 */
export function getRecaptchaConfig() {
  const version = import.meta.env.VITE_RECAPTCHA_VERSION || 'v2';
  
  if (version === 'enterprise') {
    return {
      size: 'invisible' as const,
      callback: () => console.log('🔒 reCAPTCHA: Enterprise callback executed'),
      'expired-callback': () => console.log('🔒 reCAPTCHA: Enterprise expired callback executed')
    };
  } else {
    return {
      size: 'invisible' as const,
      callback: () => console.log('🔒 reCAPTCHA: v2 callback executed'),
      'expired-callback': () => console.log('🔒 reCAPTCHA: v2 expired callback executed')
    };
  }
}
