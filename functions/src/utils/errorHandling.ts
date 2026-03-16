/**
 * Error Handling Utilities
 * Provides user-friendly error messages and structured error logging
 */

// Error code constants
export const ERROR_CODES = {
    // OTP Errors
    OTP_RATE_LIMIT: 'OTP_RATE_LIMIT',
    OTP_INVALID: 'OTP_INVALID',
    OTP_EXPIRED: 'OTP_EXPIRED',
    OTP_LOCKED: 'OTP_LOCKED',

    // Session Errors
    SESSION_INVALID: 'SESSION_INVALID',
    SESSION_EXPIRED: 'SESSION_EXPIRED',

    // Payment Errors
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    PAYMENT_DECLINED: 'PAYMENT_DECLINED',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    INVALID_CARD: 'INVALID_CARD',

    // Authorization Errors
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',

    // Validation Errors
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

    // System Errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

// User-friendly error messages
const ERROR_MESSAGES: Record<string, string> = {
    [ERROR_CODES.OTP_RATE_LIMIT]: 'Too many OTP requests. Please wait a few minutes before trying again.',
    [ERROR_CODES.OTP_INVALID]: 'Invalid verification code. Please check and try again.',
    [ERROR_CODES.OTP_EXPIRED]: 'Verification code has expired. Please request a new code.',
    [ERROR_CODES.OTP_LOCKED]: 'Too many failed attempts. Your account is temporarily locked. Please try again later.',

    [ERROR_CODES.SESSION_INVALID]: 'Your session is invalid. Please start over.',
    [ERROR_CODES.SESSION_EXPIRED]: 'Your session has expired. Please verify your phone number again.',

    [ERROR_CODES.PAYMENT_FAILED]: 'Payment failed. Please try again or use a different payment method.',
    [ERROR_CODES.PAYMENT_DECLINED]: 'Your payment was declined. Please check your payment details or try a different card.',
    [ERROR_CODES.INSUFFICIENT_FUNDS]: 'Insufficient funds. Please check your account balance or use a different payment method.',
    [ERROR_CODES.INVALID_CARD]: 'Invalid card details. Please check your card information and try again.',

    [ERROR_CODES.UNAUTHORIZED]: 'You must be logged in to perform this action.',
    [ERROR_CODES.FORBIDDEN]: 'You do not have permission to perform this action.',

    [ERROR_CODES.INVALID_INPUT]: 'Invalid input. Please check your information and try again.',
    [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Required field is missing. Please fill in all required fields.',

    [ERROR_CODES.INTERNAL_ERROR]: 'An unexpected error occurred. Please try again later.',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
};

/**
 * Get user-friendly error message for error code
 */
export function getUserFriendlyError(errorCode: string, defaultMessage?: string): string {
    return ERROR_MESSAGES[errorCode] || defaultMessage || ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];
}

/**
 * Log error with structured information
 */
export function logError(
    context: string,
    error: Error | unknown,
    additionalInfo?: Record<string, any>
): void {
    const errorInfo = {
        context,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
        } : {
            message: String(error),
        },
        ...additionalInfo,
    };

    console.error(`[ERROR] ${context}:`, JSON.stringify(errorInfo, null, 2));
}

/**
 * Retry operation with exponential backoff
 */
export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries - 1) {
                const delayMs = baseDelayMs * Math.pow(2, attempt);
                console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
    errorCode: string,
    message?: string,
    details?: Record<string, any>
) {
    return {
        success: false,
        error: {
            code: errorCode,
            message: message || getUserFriendlyError(errorCode),
            ...details,
        },
    };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error | unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('unavailable') ||
            message.includes('econnreset') ||
            message.includes('enotfound')
        );
    }
    return false;
}

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: Error | unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as any).message);
    }
    return 'An unknown error occurred';
}
