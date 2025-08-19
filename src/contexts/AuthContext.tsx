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
import { auth, db, USING_EMULATORS } from '../config/firebase';
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
  // kept for compatibility; the argument is ignored
  setupRecaptcha: (_elementId?: string) => RecaptchaVerifier;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

/* =============================================================================
   reCAPTCHA: single global verifier bound to a single DOM node
   Using modular SDK signature: new RecaptchaVerifier(auth, containerOrId, params)
   We “swap” the DOM node when resetting to avoid the “already rendered” loop.
   ============================================================================ */
const RECAPTCHA_ID = 'recaptcha-container';
let _recaptchaVerifierSingleton: RecaptchaVerifier | null = null;

function ensureRecaptchaHostEl(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('reCAPTCHA not available in this environment');
  }
  let el = document.getElementById(RECAPTCHA_ID);
  if (!el) {
    // Fallback: create one if shell hasn’t rendered it yet
    el = document.createElement('div');
    el.id = RECAPTCHA_ID;
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    el.style.zIndex = '-1';
    document.body.appendChild(el);
  }
  return el;
}

/** Replace the recaptcha container element with a fresh node (same id). */
function swapRecaptchaContainer(): HTMLElement {
  const oldEl = ensureRecaptchaHostEl();
  const fresh = oldEl.cloneNode(false) as HTMLElement;
  oldEl.parentNode?.replaceChild(fresh, oldEl);
  return fresh;
}

function createRecaptcha(): RecaptchaVerifier {
  // Fully detach any previous grecaptcha widget by swapping the container node.
  swapRecaptchaContainer();

  // ✅ Modular SDK: (auth, containerOrId, parameters)
  const verifier = new RecaptchaVerifier(auth, RECAPTCHA_ID, {
    size: 'invisible',
    callback: () => console.log('reCAPTCHA solved'),
    'expired-callback': () => console.log('reCAPTCHA expired'),
  });

  _recaptchaVerifierSingleton = verifier;
  return verifier;
}

function getOrCreateRecaptcha(): RecaptchaVerifier {
  if (_recaptchaVerifierSingleton && document.getElementById(RECAPTCHA_ID)) {
    return _recaptchaVerifierSingleton;
  }
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
  try {
    swapRecaptchaContainer();
  } catch {}
}
/* ============================================================================= */

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

  // kept for compatibility; ignores the passed id and uses the single global container
  const setupRecaptcha = (): RecaptchaVerifier => getOrCreateRecaptcha();

  const sendVerificationCode = async (phoneNumber: string): Promise<ConfirmationResult> => {
    // Emulator path: no reCAPTCHA required, avoids hostname issues entirely
    if (USING_EMULATORS) {
      const fakeVerifier: any = {
        type: 'recaptcha',
        verify: async () => 'test-verifier-token',
      };
      const result = await signInWithPhoneNumber(auth, phoneNumber, fakeVerifier);
      toast.success('Verification code (emulator) generated');
      return result;
    }

    // Real Firebase: use reCAPTCHA
    let verifier = getOrCreateRecaptcha();
    try {
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      toast.success('Verification code sent');
      return result;
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();

      if (err?.code === 'auth/operation-not-allowed') {
        toast.error('Enable Phone sign-in in Firebase Console → Authentication → Sign-in method → Phone.');
      }
      if (err?.code === 'auth/captcha-check-failed' || msg.includes('hostname match not found')) {
        const host =
          typeof window !== 'undefined' && (window.location?.host || window.location?.hostname)
            ? window.location.host
            : '(unknown host)';
        toast.error(
          `This domain is not authorized: ${host}. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
        );
        throw err;
      }

      // “already rendered” loop → reset & retry once
      if (msg.includes('already been rendered') || msg.includes('already')) {
        try {
          clearRecaptcha();
          const verifier2 = getOrCreateRecaptcha();
          const result = await signInWithPhoneNumber(auth, phoneNumber, verifier2);
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
