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
  // keep signature for compatibility; the id arg is ignored
  setupRecaptcha: (elementId?: string) => RecaptchaVerifier;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

/* ============================================================
   reCAPTCHA: single global verifier bound to a single DOM node
   ============================================================ */
const RECAPTCHA_ID = 'recaptcha-container'; // must exist once in App shell
let _recaptchaVerifierSingleton: RecaptchaVerifier | null = null;

function getRecaptchaHostEl(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('reCAPTCHA not available in this environment');
  }
  let el = document.getElementById(RECAPTCHA_ID);
  if (!el) {
    // Fallback: create one if shell hasn’t rendered it yet (rare)
    el = document.createElement('div');
    el.id = RECAPTCHA_ID;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

function createRecaptcha(): RecaptchaVerifier {
  const host = getRecaptchaHostEl();
  // Clear any previous widget markup the Firebase SDK injected
  host.innerHTML = '';
  const verifier = new RecaptchaVerifier(auth, host, {
    size: 'invisible',
    callback: () => console.log('reCAPTCHA solved'),
    'expired-callback': () => console.log('reCAPTCHA expired'),
  });
  _recaptchaVerifierSingleton = verifier;
  return verifier;
}

function getOrCreateRecaptcha(): RecaptchaVerifier {
  // If we already have one and the host still exists, reuse it
  if (_recaptchaVerifierSingleton && document.getElementById(RECAPTCHA_ID)) {
    return _recaptchaVerifierSingleton;
  }
  // Else (first time or after teardown), create a fresh one
  _recaptchaVerifierSingleton = null;
  return createRecaptcha();
}

function clearRecaptcha() {
  try {
    _recaptchaVerifierSingleton?.clear();
  } catch (e) {
    console.warn('recaptcha clear error', e);
  }
  _recaptchaVerifierSingleton = null;
  const host = document.getElementById(RECAPTCHA_ID);
  if (host) host.innerHTML = '';
}

/* ============================================================ */

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

    // Provider unmount cleanup
    return () => {
      unsubAuth();
      docUnsubRef.current?.();
      clearRecaptcha();
    };
  }, []);

  // Kept for compatibility; ignores the passed id and uses the global container.
  const setupRecaptcha = (): RecaptchaVerifier => getOrCreateRecaptcha();

  const sendVerificationCode = async (phoneNumber: string): Promise<ConfirmationResult> => {
    let verifier = getOrCreateRecaptcha();
    try {
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      toast.success('Verification code sent');
      return result;
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();

      if (err?.code === 'auth/operation-not-allowed') {
        toast.error(
          'Enable Phone sign-in in Firebase Console → Authentication → Sign-in method → Phone.'
        );
      }

      // “already rendered” or stale widget → reset & retry once
      if (msg.includes('already been rendered') || msg.includes('already')) {
        try {
          clearRecaptcha();
          verifier = getOrCreateRecaptcha();
          const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
          toast.success('Verification code sent');
          return result;
        } catch (retryErr: any) {
          console.error('reCAPTCHA retry failed:', retryErr);
          toast.error(retryErr?.message || 'Failed to send verification code');
          throw retryErr;
        }
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
      if (error?.code === 'auth/invalid-verification-code')
        msg = 'Invalid verification code. Please try again.';
      else if (error?.code === 'auth/code-expired')
        msg = 'Verification code expired. Request a new one.';
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
      // Always tear down the widget on logout
      clearRecaptcha();
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({ currentUser, loading, sendVerificationCode, verifyCode, logout, setupRecaptcha }),
    [currentUser, loading]
  );

  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
