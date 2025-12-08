// src/components/auth/Login.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Phone, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ConfirmationResult } from 'firebase/auth';
import { normalizeUSPhoneToE164OrNull } from '../../utils/phone';
import toast from 'react-hot-toast';

// Keep the schema loose; we’ll do real normalization/validation in submit
const phoneSchema = z.object({
  phoneNumber: z.string().min(7, 'Please enter your phone number'),
});

const codeSchema = z.object({
  verificationCode: z.string().min(6, 'Verification code must be 6 digits'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type CodeFormData = z.infer<typeof codeSchema>;

const Login: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const { sendVerificationCode, verifyCode, checkIfUserExists } = useAuth();
  const navigate = useNavigate();

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const codeForm  = useForm<CodeFormData>({ resolver: zodResolver(codeSchema) });

  const onPhoneSubmit = async (data: PhoneFormData) => {
    // Normalize to E.164 (+1XXXXXXXXXX) for Firebase
    const e164 = normalizeUSPhoneToE164OrNull(data.phoneNumber);
    if (!e164) {
      phoneForm.setError('phoneNumber', {
        message: 'Please enter a valid US number (e.g., 212 555 0123).',
      });
      return; // don't call Firebase with an invalid number
    }

    setIsLoading(true);
    try {
      console.log('🔍 Login: Checking if phone number is registered...');
      
      // First, check if this phone number is registered
      const userExists = await checkIfUserExists(e164);
      if (!userExists) {
        console.log('🔍 Login: User not found, showing error message');
        toast.error('Phone number not registered. Please register first.');
        phoneForm.setError('phoneNumber', {
          message: 'This phone number is not registered. Please register first.'
        });
        return;
      }
      
      console.log('🔍 Login: User found, sending verification code...');
      // User exists, send verification code
      const result = await sendVerificationCode(e164);
      setConfirmationResult(result);
      console.log('🔍 Login: Phone verification successful, switching to code step');

      // Clear phone input and code input, switch step, focus code field
      phoneForm.reset({ phoneNumber: '' });
      codeForm.reset({ verificationCode: '' });
      setStep('code');
      requestAnimationFrame(() => codeForm.setFocus('verificationCode'));
   } catch (err: any) {
  console.error('Phone verification error:', err);

  let message = 'Could not send code. Please try again.';

  switch (err?.code) {
    case 'auth/invalid-phone-number':
      message = 'Invalid phone number. Please check and try again.';
      break;
    case 'auth/captcha-check-failed':
      message =
        "reCAPTCHA failed: add this site’s host to Firebase → Authentication → Authorized domains, then retry.";
      break;
    case 'auth/operation-not-allowed':
      message =
        'Phone sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.';
      break;
    case 'auth/too-many-requests':
      message = 'Too many attempts. Please wait a minute and try again.';
      break;
    case 'auth/network-request-failed':
      message = 'Network error. Check your connection and try again.';
      break;
  }

  const lower = String(err?.message || '').toLowerCase();
  if (lower.includes('hostname match not found')) {
    message =
      "This preview host isn’t authorized in Firebase. Add the exact host under Authentication → Authorized domains and retry.";
  } else if (lower.includes('already been rendered')) {
    message = 'Security check hiccup. Please try again.';
  }

  phoneForm.setError('phoneNumber', { message });
}
 finally {
      setIsLoading(false);
    }
  };

  const onCodeSubmit = async (data: CodeFormData) => {
    console.log('🔍 Login: onCodeSubmit called with data:', data);
    console.log('🔍 Login: Current state:', { confirmationResult: !!confirmationResult });
    
    if (!confirmationResult) {
      console.log('🔍 Login: No confirmationResult, returning');
      return;
    }

    setIsLoading(true);
    try {
      console.log('🔍 Login: Calling verifyCode with isLogin=true (will preserve existing user data)');
      console.log('🔍 Login: This is a LOGIN attempt - should only work for existing users');
      await verifyCode(confirmationResult, data.verificationCode, '', '', '', true);
      console.log('🔍 Login: verifyCode completed successfully, Layout will handle routing based on status');
      // Navigate to home - Layout.tsx will automatically redirect pending users to /pending-approval
      // and rejected users to /account-rejected based on their status
      navigate('/');
    } catch (error) {
      console.error('🚨 Login: Code verification error:', {
        error,
        errorCode: (error as any)?.code,
        errorMessage: (error as any)?.message,
        errorStack: (error as any)?.stack
      });
      
      const errorMessage = (error as any)?.message;
      
      // 🔥 FIX: Handle specific error messages from AuthContext for redirection
      if (errorMessage?.includes('No account found')) {
        toast.error('No account found. Please register first.');
        // Reset to phone step and redirect to registration
        setStep('phone');
        phoneForm.reset();
        navigate('/register');
      } else {
        toast.error(errorMessage || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-[#F25129]/20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1">
              Welcome Back
            </h2>
            <p className="text-gray-600 mt-2">
              {step === 'phone'
                ? 'Enter your phone number to sign in'
                : 'Enter the verification code sent to your phone'}
            </p>
            {step === 'phone' && (
              <div className="text-sm text-gray-500 mt-2 space-y-1">
                <p>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/register')}
                    className="text-[#F25129] hover:text-[#FFC107] font-medium underline"
                  >
                    Register here
                  </button>
                </p>
                <p className="text-xs text-gray-400">
                  Only registered users can sign in. New users should register first.
                </p>
              </div>
            )}
          </div>

          {step === 'phone' ? (
            <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                  <input
                    {...phoneForm.register('phoneNumber')}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                      phoneForm.formState.errors.phoneNumber ? 'border-red-300' : 'border-gray-300'
                    } focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                    placeholder="e.g. 212 555 0123, (212) 555-0123, or 2125550123"
                  />
                </div>
                {phoneForm.formState.errors.phoneNumber && (
                  <p className="mt-1 text-sm text-red-600">
                    {phoneForm.formState.errors.phoneNumber.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-medium hover:from-[#E0451F] hover:to-[#E55A2A] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...codeForm.register('verificationCode')}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    onInput={(e) => {
                      const t = e.currentTarget;
                      t.value = t.value.replace(/\D/g, '').slice(0, 6);
                    }}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest"
                    placeholder="000000"
                  />
                </div>
                {codeForm.formState.errors.verificationCode && (
                  <p className="mt-1 text-sm text-red-600">
                    {codeForm.formState.errors.verificationCode.message}
                  </p>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    requestAnimationFrame(() => phoneForm.setFocus('phoneNumber'));
                  }}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-medium hover:from-[#E0451F] hover:to-[#E55A2A] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Verifying...' : 'Verify Code'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="text-[#F25129] hover:text-[#E0451F] font-medium transition-colors"
              >
                Join our MOJO
              </Link>
            </p>
          </div>
        </div>
      </div>


    </div>
  );
};

export default Login;
