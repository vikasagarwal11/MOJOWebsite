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
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
});

const codeSchema = z.object({
  verificationCode: z.string().min(6, 'Verification code must be 6 digits'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type CodeFormData  = z.infer<typeof codeSchema>;

const Register: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const { sendVerificationCode, verifyCode } = useAuth();
  const navigate = useNavigate();

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const codeForm  = useForm<CodeFormData>({ resolver: zodResolver(codeSchema) });

  const onPhoneSubmit = async (data: PhoneFormData) => {
    // Normalize anything the user types (US-first) to E.164
    const e164 = normalizeUSPhoneToE164OrNull(data.phoneNumber);
    if (!e164) {
      phoneForm.setError('phoneNumber', {
        message: 'Enter a valid US number like 5551234567 or +12025550123',
      });
      return;
    }

    setIsLoading(true);
    setDisplayName(data.displayName);

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
    if (!confirmationResult) return;
    setIsLoading(true);
    try {
      await verifyCode(confirmationResult, data.verificationCode, displayName);
      navigate('/');
    } catch (err: any) {
      console.error('Code verification error:', err);
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
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-purple-100">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...phoneForm.register('displayName')}
                    type="text"
                    autoComplete="name"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                    placeholder="Enter your full name"
                  />
                </div>
                {phoneForm.formState.errors.displayName && (
                  <p className="mt-1 text-sm text-red-600">
                    {phoneForm.formState.errors.displayName.message}
                  </p>
                )}
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
                    } focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200`}
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
                className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest"
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
                  className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Verifying...' : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium transition-colors">
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
