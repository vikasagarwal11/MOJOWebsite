import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Phone, Shield, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ConfirmationResult } from 'firebase/auth';
import { normalizeUSPhoneToE164OrNull } from '../../utils/phone';

const phoneSchema = z.object({
  // We do strict normalization with normalizeUSPhoneToE164OrNull in onPhoneSubmit
  phoneNumber: z.string().min(7, 'Enter a phone like 5551234567 or +12025550123'),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
});

const codeSchema = z.object({
  verificationCode: z.string().min(6, 'Verification code must be 6 digits'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type CodeFormData  = z.infer<typeof codeSchema>;

const Register: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const { sendVerificationCode, verifyCode } = useAuth();
  const navigate = useNavigate();

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const codeForm  = useForm<CodeFormData>({ resolver: zodResolver(codeSchema) });

  const onPhoneSubmit = async (data: PhoneFormData) => {
    console.log('🔍 Register: onPhoneSubmit called with data:', data);
    
    // Normalize anything the user types (US-first) to E.164
    const e164 = normalizeUSPhoneToE164OrNull(data.phoneNumber);
    console.log('🔍 Register: Phone normalization result:', { original: data.phoneNumber, e164 });
    
    if (!e164) {
      console.log('🔍 Register: Phone normalization failed');
      phoneForm.setError('phoneNumber', {
        message: 'Enter a valid US number like 5551234567 or +12025550123',
      });
      return;
    }

    console.log('🔍 Register: Setting state variables');
    setIsLoading(true);
    setFirstName(data.firstName);
    setLastName(data.lastName);
    setPhoneNumber(e164);

    try {
      // IMPORTANT: Always send E.164 to Firebase
      const result = await sendVerificationCode(e164);
      setConfirmationResult(result);
      setStep('code');
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

  // Handle common text variants too
  const lower = String(err?.message || '').toLowerCase();
  if (lower.includes('hostname match not found')) {
    message =
      "This preview host isn’t authorized in Firebase. Add the exact host under Authentication → Authorized domains and retry.";
  } else if (lower.includes('already been rendered')) {
    // We retry inside AuthContext, but surface a friendly note here just in case
    message = 'Security check hiccup. Please try again.';
  }

  phoneForm.setError('phoneNumber', { message });
}
 finally {
      setIsLoading(false);
    }
  };

  const onCodeSubmit = async (data: CodeFormData) => {
    console.log('🔍 Register: onCodeSubmit called with data:', data);
    console.log('🔍 Register: Current state:', { firstName, lastName, phoneNumber, confirmationResult: !!confirmationResult });
    
    if (!confirmationResult) {
      console.log('🔍 Register: No confirmationResult, returning');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('🔍 Register: Calling verifyCode with:', {
        code: data.verificationCode,
        firstName,
        lastName,
        phoneNumber
      });
      
      await verifyCode(confirmationResult, data.verificationCode, firstName, lastName, phoneNumber, false);
      console.log('🔍 Register: verifyCode completed successfully, navigating to home');
      navigate('/');
    } catch (err: any) {
      console.error('🚨 Register: Code verification error:', {
        error: err,
        errorCode: err?.code,
        errorMessage: err?.message,
        errorStack: err?.stack
      });
      const msg =
        err?.code === 'auth/code-expired'
          ? 'Verification code expired. Request a new one.'
          : 'Invalid code. Please try again.';
      codeForm.setError('verificationCode', { message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-[#F25129]/20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-[#F25129] to-[#FF6B35] bg-clip-text text-transparent leading-relaxed pb-1">
              Join Our Community
            </h2>
            <p className="text-gray-600 mt-2">
              {step === 'phone'
                ? 'Create your account to start your fitness journey'
                : 'Enter the verification code sent to your phone'}
            </p>
          </div>

          {step === 'phone' ? (
            <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      {...phoneForm.register('firstName')}
                      type="text"
                      autoComplete="given-name"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="First name"
                    />
                  </div>
                  {phoneForm.formState.errors.firstName && (
                    <p className="mt-1 text-sm text-red-600">
                      {phoneForm.formState.errors.firstName.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      {...phoneForm.register('lastName')}
                      type="text"
                      autoComplete="family-name"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="Last name"
                    />
                  </div>
                  {phoneForm.formState.errors.lastName && (
                    <p className="mt-1 text-sm text-red-600">
                      {phoneForm.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
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
                    placeholder="e.g., 5551234567 or (555) 123-4567"
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
                className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-medium hover:from-[#E0451F] hover:to-[#E55A2A] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Verification Code</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...codeForm.register('verificationCode')}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
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
                  onClick={() => setStep('phone')}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-medium hover:from-[#E0451F] hover:to-[#E55A2A] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Verifying...' : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-[#F25129] hover:text-[#E0451F] font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>


    </div>
  );
};

export default Register;
