/**
 * reCAPTCHA Enterprise Verification Service
 * Handles backend verification of reCAPTCHA tokens
 */

interface RecaptchaVerificationRequest {
  token: string;
  action: string;
}

interface RecaptchaAssessmentResponse {
  tokenProperties: {
    valid: boolean;
    invalidReason?: string;
    hostname: string;
    action: string;
    createTime: string;
  };
  riskAnalysis: {
    score: number;
    reasons: string[];
  };
  event: {
    token: string;
    siteKey: string;
    userAgent: string;
    userIpAddress: string;
    expectedAction: string;
  };
}

/**
 * Verify reCAPTCHA Enterprise token on the backend
 */
export async function verifyRecaptchaToken(
  token: string,
  expectedAction: string = 'LOGIN'
): Promise<{ isValid: boolean; score: number; error?: string }> {
  try {
    const apiKey = import.meta.env.VITE_RECAPTCHA_API_KEY;
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

    if (!apiKey || !projectId || !siteKey) {
      throw new Error('Missing reCAPTCHA configuration');
    }

    const requestBody = {
      event: {
        token,
        expectedAction,
        siteKey
      }
    };

    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`reCAPTCHA verification failed: ${response.status} ${errorData}`);
    }

    const data: RecaptchaAssessmentResponse = await response.json();

    // Check if token is valid
    if (!data.tokenProperties.valid) {
      return {
        isValid: false,
        score: 0,
        error: data.tokenProperties.invalidReason || 'Invalid token'
      };
    }

    // Check if action matches
    if (data.tokenProperties.action !== expectedAction) {
      return {
        isValid: false,
        score: data.riskAnalysis.score,
        error: `Action mismatch. Expected: ${expectedAction}, Got: ${data.tokenProperties.action}`
      };
    }

    // Return verification result
    return {
      isValid: true,
      score: data.riskAnalysis.score,
    };

  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return {
      isValid: false,
      score: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Verify reCAPTCHA token with custom risk threshold
 */
export async function verifyRecaptchaWithThreshold(
  token: string,
  expectedAction: string = 'LOGIN',
  minScore: number = 0.5
): Promise<{ isValid: boolean; score: number; error?: string }> {
  const result = await verifyRecaptchaToken(token, expectedAction);
  
  if (!result.isValid) {
    return result;
  }

  if (result.score < minScore) {
    return {
      isValid: false,
      score: result.score,
      error: `Risk score too low: ${result.score} (minimum: ${minScore})`
    };
  }

  return result;
}

/**
 * Get reCAPTCHA configuration for current environment
 */
export function getRecaptchaConfig() {
  return {
    siteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
    apiKey: import.meta.env.VITE_RECAPTCHA_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    version: import.meta.env.VITE_RECAPTCHA_VERSION || 'v2'
  };
}
