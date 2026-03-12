/**
 * Guest Payment Types
 * Frontend types for guest payment flow with OTP verification
 */

export interface GuestContactInfo {
    firstName: string;
    lastName: string;
    email: string;
    phone: string; // E.164 format
}

export interface GuestSession {
    sessionToken: string;
    expiresAt: Date;
}

export interface OTPSendResult {
    success: boolean;
    requestId: string;
    expiresIn: number;
    attemptsRemaining: number;
    error?: string;
    lockoutEndsAt?: string;
}

export interface OTPVerifyResult {
    verified: boolean;
    sessionToken?: string;
    expiresAt?: string;
    error?: string;
    attemptsRemaining?: number;
    lockoutEndsAt?: string;
}

export interface PaymentIntentResponse {
    clientSecret?: string;
    paymentIntentId?: string;
    instructions?: ZelleInstructions;
    transactionId: string;
    amount: number;
    currency: string;
}

export interface ZelleInstructions {
    recipientEmail: string;
    recipientPhone: string;
    amount: number;
    currency: string;
    memo: string;
    instructions: string[];
}

export type GuestPaymentStep = 'contact' | 'otp' | 'payment' | 'confirmation';

export interface GuestPaymentState {
    step: GuestPaymentStep;
    contactInfo: GuestContactInfo | null;
    sessionToken: string | null;
    sessionExpiry: Date | null;
    otpAttempts: number;
    error: string | null;
    transactionId: string | null;
}
