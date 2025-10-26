/**
 * Example: How to use reCAPTCHA Enterprise in your authentication flow
 * This shows the complete frontend-to-backend verification process
 */

import { executeRecaptchaEnterprise } from '@/utils/recaptcha';
import { verifyRecaptchaToken } from '@/services/recaptchaVerificationService';

/**
 * Example: Login with reCAPTCHA Enterprise verification
 */
export async function loginWithRecaptcha(email: string, password: string) {
  try {
    // Step 1: Generate reCAPTCHA token on frontend
    console.log('🔒 Generating reCAPTCHA token...');
    const recaptchaToken = await executeRecaptchaEnterprise('LOGIN');
    
    if (!recaptchaToken) {
      throw new Error('Failed to generate reCAPTCHA token');
    }

    // Step 2: Send login request with reCAPTCHA token
    console.log('📤 Sending login request with reCAPTCHA token...');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        recaptchaToken,
        action: 'LOGIN'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Login failed');
    }

    const result = await response.json();
    console.log('✅ Login successful:', result);
    return result;

  } catch (error) {
    console.error('❌ Login failed:', error);
    throw error;
  }
}

/**
 * Example: Registration with reCAPTCHA Enterprise verification
 */
export async function registerWithRecaptcha(userData: {
  email: string;
  password: string;
  displayName: string;
}) {
  try {
    // Step 1: Generate reCAPTCHA token
    console.log('🔒 Generating reCAPTCHA token for registration...');
    const recaptchaToken = await executeRecaptchaEnterprise('REGISTER');
    
    if (!recaptchaToken) {
      throw new Error('Failed to generate reCAPTCHA token');
    }

    // Step 2: Send registration request
    console.log('📤 Sending registration request...');
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...userData,
        recaptchaToken,
        action: 'REGISTER'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Registration failed');
    }

    const result = await response.json();
    console.log('✅ Registration successful:', result);
    return result;

  } catch (error) {
    console.error('❌ Registration failed:', error);
    throw error;
  }
}

/**
 * Example: Backend verification (for your API endpoints)
 */
export async function verifyRecaptchaOnBackend(token: string, action: string) {
  try {
    console.log(`🔍 Verifying reCAPTCHA token for action: ${action}`);
    
    const result = await verifyRecaptchaToken(token, action);
    
    if (!result.isValid) {
      console.error('❌ reCAPTCHA verification failed:', result.error);
      return {
        success: false,
        error: result.error,
        score: result.score
      };
    }

    console.log(`✅ reCAPTCHA verified successfully. Score: ${result.score}`);
    return {
      success: true,
      score: result.score,
      isValid: result.isValid
    };

  } catch (error) {
    console.error('❌ reCAPTCHA verification error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Example: Using in a React component
 */
export function useRecaptchaAuth() {
  const handleLogin = async (email: string, password: string) => {
    try {
      await loginWithRecaptcha(email, password);
      // Handle successful login
    } catch (error) {
      // Handle login error
      console.error('Login failed:', error);
    }
  };

  const handleRegister = async (userData: any) => {
    try {
      await registerWithRecaptcha(userData);
      // Handle successful registration
    } catch (error) {
      // Handle registration error
      console.error('Registration failed:', error);
    }
  };

  return {
    handleLogin,
    handleRegister
  };
}
