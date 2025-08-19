import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User } from '../types';
import toast from 'react-hot-toast';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  sendVerificationCode: (phoneNumber: string) => Promise<ConfirmationResult>;
  verifyCode: (
    confirmationResult: ConfirmationResult,
    code: string,
    displayName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  setupRecaptcha: (elementId: string) => RecaptchaVerifier;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

// ---- Singleton reCAPTCHA verifier ----
let _recaptchaVerifierSingleton: RecaptchaVerifier | null = null;

function getOrCreateRecaptcha(elementId: string): RecaptchaVerifier {
  if (_recaptchaVerifierSingleton) return _recaptchaVerifierSingleton;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('reCAPTCHA not available in this environment');
  }
  const el = document.getElementById(elementId);
  if (!el) {
    const msg = `reCAPTCHA container #${elementId} not found in DOM`;
    console.error(msg);
    throw new Error(msg);
  }
  _recaptchaVerifierSingleton = new RecaptchaVerifier(auth, el, {
    size: 'invisible',
    callback: () => console.log('reCAPTCHA solved'),
    'expired-callback': () => console.log('reCAPTCHA expired'),
  });
  return _recaptchaVerifierSingleton;
}

function clearRecaptcha(elementId: string) {
  try {
    _recaptchaVerifierSingleton?.clear();
  } catch {}
  _recaptchaVerifierSingleton = null;
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = '';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const docUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      // tear down previous user doc listener
      docUnsubRef.current?.();
      docUnsubRef.current = null;

      if (!fbUser) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const userRef = doc(db, 'users', fbUser.uid);
      const unsubDoc = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) {
            // First-time: minimal shell
            setCurrentUser({
              id: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || 'Member',
              photoURL: fbUser.photoURL || undefined,
              role: 'member',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          } else {
            const d = snap.data() as any;
            setCurrentUser({
              id: fbUser.uid,
              email: d.email || fbUser.email || '',
              displayName: d.displayName || fbUser.displayName || 'Member',
              photoURL: d.photoURL || fbUser.photoURL || undefined,
              role: d.role || 'member',
              createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
              updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
            });
          }
          setLoading(false);
        },
        (err) => {
          console.error('user doc snapshot error:', err);
          setLoading(false);
        }
      );

      docUnsubRef.current = unsubDoc;
    });

    return () => {
      unsubAuth();
      docUnsubRef.current?.();
    };
  }, []);

  const setupRecaptcha = (elementId: string): RecaptchaVerifier => getOrCreateRecaptcha(elementId);

  const sendVerificationCode = async (phoneNumber: string): Promise<ConfirmationResult> => {
    let verifier = getOrCreateRecaptcha('recaptcha-container');
    try {
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      toast.success('Verification code sent');
      return result;
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (err?.code === 'auth/operation-not-allowed') {
        toast.error('Enable Phone sign-in in Firebase Console → Authentication → Sign-in method → Phone.');
      }
      if (msg.includes('reCAPTCHA has already been rendered')) {
        clearRecaptcha('recaptcha-container');
        verifier = getOrCreateRecaptcha('recaptcha-container');
        return await signInWithPhoneNumber(auth, phoneNumber, verifier);
      }
      console.error('Phone verification error:', err);
      toast.error(err?.message || 'Failed to send verification code');
      throw err;
    }
  };

  const verifyCode = async (
    confirmationResult: ConfirmationResult,
    code: string,
    displayName?: string
  ) => {
    try {
      const cred = await confirmationResult.confirm(code);
      const fbUser = cred.user;
      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, {
          email: fbUser.email || '',
          displayName: displayName || fbUser.displayName || 'New Member',
          role: 'member',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Account created');
      } else {
        await updateDoc(userRef, { updatedAt: serverTimestamp() });
        toast.success('Welcome back');
      }
      // onSnapshot updates UI
    } catch (error: any) {
      console.error('Code verification error:', error);
      let msg = 'Invalid verification code';
      if (error?.code === 'auth/invalid-verification-code') msg = 'Invalid verification code. Please try again.';
      else if (error?.code === 'auth/code-expired') msg = 'Verification code expired. Request a new one.';
      toast.error(msg);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out');
    } catch (error: any) {
      console.error('Logout error:', error);
      toast.error(error?.message || 'Failed to log out');
      throw error;
    } finally {
      clearRecaptcha('recaptcha-container');
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({ currentUser, loading, sendVerificationCode, verifyCode, logout, setupRecaptcha }),
    [currentUser, loading]
  );

  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
