/**
 * reCAPTCHA v2 Type Declarations
 * Extends the global Window interface for reCAPTCHA configuration
 */

declare global {
  interface Window {
    grecaptcha: {
      render: (container: string | HTMLElement, parameters: any) => number;
      ready: (callback: Function) => void;
      execute: (siteKey: string, options: any) => Promise<string>;
      enterprise?: any; // Will be undefined in v2
    };
    recaptchaOptions: {
      version: 'v2';
      enterprise: false;
    };
  }
}

export {};
