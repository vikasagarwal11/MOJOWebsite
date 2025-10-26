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
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../config/firebase';
import { auth, db, USING_EMULATORS } from '../config/firebase';
import { User } from '../types';
import toast from 'react-hot-toast';
import { getRecaptchaConfig } from '../utils/recaptcha';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  listenersReady: boolean; // Add this new state
  sendVerificationCode: (phoneNumber: string) => Promise<ConfirmationResult>;
  verifyCode: (
    confirmationResult: ConfirmationResult,
    code: string,
    firstName: string,
    lastName: string,
    phoneNumber: string,
    isLogin?: boolean
  ) => Promise<void>;
  checkIfUserExists: (phoneNumber: string) => Promise<boolean>;
  checkSMSDeliveryStatus: (phoneNumber: string, verificationId: string) => Promise<any>;
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
    el.style.bottom = '20px';
    el.style.right = '20px';
    el.style.zIndex = '9999';
    el.style.width = '300px';
    el.style.height = '80px';
    el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)'; // Red tint for debugging
    el.style.border = '2px solid red'; // Red border for debugging
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = 'red';
    el.style.fontSize = '12px';
    el.innerHTML = 'reCAPTCHA Container';
    document.body.appendChild(el);
    console.log('🔍 AuthContext: Created reCAPTCHA container:', el);
  } else {
    console.log('🔍 AuthContext: Found existing reCAPTCHA container:', el);
  }
  return el;
}

/** Replace the recaptcha container element with a fresh node (same id). */
function swapRecaptchaContainer(): HTMLElement {
  console.log('🔍 AuthContext: Swapping reCAPTCHA container...');
  const oldEl = ensureRecaptchaHostEl();
  console.log('🔍 AuthContext: Old container:', oldEl);
  const fresh = oldEl.cloneNode(false) as HTMLElement;
  fresh.id = RECAPTCHA_ID;
  oldEl.parentNode?.replaceChild(fresh, oldEl);
  console.log('🔍 AuthContext: New container ready:', fresh);
  return fresh;
}

function createRecaptcha(): RecaptchaVerifier {
  console.log('🔍 AuthContext: Creating new reCAPTCHA verifier...');
  
  // Check if reCAPTCHA script is loaded
  if (typeof (window as any).grecaptcha === 'undefined') {
    console.error('🚨 AuthContext: reCAPTCHA script not loaded! grecaptcha is undefined');
    throw new Error('reCAPTCHA script not loaded. Please check if the script is included in your HTML.');
  }
  
  // Ensure we're using v2 and disable Enterprise
  if ((window as any).grecaptcha.enterprise) {
    console.log('🔍 AuthContext: Disabling reCAPTCHA Enterprise to prevent warnings');
    (window as any).grecaptcha.enterprise = undefined;
  }
  
  // Fully detach any previous grecaptcha widget by swapping the container node.
  const container = swapRecaptchaContainer();
  console.log('🔍 AuthContext: reCAPTCHA container ready:', container);

  // ✅ Modular SDK: (auth, containerOrId, parameters)
  const verifier = new RecaptchaVerifier(auth, RECAPTCHA_ID, {
    size: 'invisible',
    callback: () => console.log('🔍 AuthContext: reCAPTCHA solved'),
    'expired-callback': () => console.log('🔍 AuthContext: reCAPTCHA expired'),
  });

  console.log('🔍 AuthContext: reCAPTCHA verifier created successfully');
  _recaptchaVerifierSingleton = verifier;
  return verifier;
}

function getOrCreateRecaptcha(): RecaptchaVerifier {
  console.log('🔍 AuthContext: getOrCreateRecaptcha called');
  
  // Check if we have a valid verifier and container
  const container = document.getElementById(RECAPTCHA_ID);
  if (_recaptchaVerifierSingleton && container && container.parentNode) {
    console.log('🔍 AuthContext: Returning existing reCAPTCHA verifier');
    return _recaptchaVerifierSingleton;
  }
  
  console.log('🔍 AuthContext: Creating new reCAPTCHA verifier');
  _recaptchaVerifierSingleton = null;
  return createRecaptcha();
}

function clearRecaptcha() {
  console.log('🔍 AuthContext: Clearing reCAPTCHA...');
  try {
    _recaptchaVerifierSingleton?.clear();
    console.log('🔍 AuthContext: reCAPTCHA verifier cleared');
  } catch (e) {
    console.warn('🚨 AuthContext: reCAPTCHA clear error:', e);
  }
  _recaptchaVerifierSingleton = null;
  
  // Wait a bit before swapping container to let reCAPTCHA finish cleanup
  setTimeout(() => {
    try {
      swapRecaptchaContainer();
      console.log('🔍 AuthContext: reCAPTCHA container swapped');
    } catch (e) {
      console.warn('🚨 AuthContext: reCAPTCHA container swap error:', e);
    }
  }, 100);
}
/* ============================================================================= */

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [listenersReady, setListenersReady] = useState(false); // Add this state
  const docUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    console.log('🔍 AuthContext: Setting up onAuthStateChanged listener');
    
    const unsubAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      console.log('🔍 AuthContext: onAuthStateChanged fired', {
        hasUser: !!fbUser,
        userId: fbUser?.uid,
        email: fbUser?.email,
        displayName: fbUser?.displayName,
        phoneNumber: fbUser?.phoneNumber
      });

      // tear down previous user doc listener
      if (docUnsubRef.current) {
        console.log('🔍 AuthContext: Cleaning up previous listener');
        docUnsubRef.current();
        docUnsubRef.current = null;
      }

      if (!fbUser) {
        console.log('🔍 AuthContext: No user, setting currentUser to null');
        setCurrentUser(null);
        setLoading(false);
        setListenersReady(false); // Reset listeners ready state
        return;
      }

      console.log('🔍 AuthContext: Setting up onSnapshot for user:', fbUser.uid);
      const userRef = doc(db, 'users', fbUser.uid);
      console.log('🔍 AuthContext: User document reference:', userRef.path);
      
      const unsubDoc = onSnapshot(
        userRef,
        (snap) => {
          console.log('🔍 AuthContext: onSnapshot callback fired', {
            exists: snap.exists(),
            hasData: !!snap.data(),
            dataKeys: snap.exists() ? Object.keys(snap.data() || {}) : [],
            userId: fbUser.uid
          });
          
          if (!snap.exists()) {
            console.log('🔍 AuthContext: Document does not exist - user needs to register');
            // Don't create minimal users - let the verifyCode function handle this
            // This prevents "ghost users" from being created during login
            console.log('🔍 AuthContext: Setting currentUser to null - user must register');
            setCurrentUser(null);
          } else {
            console.log('🔍 AuthContext: Document exists, loading full user data');
            const d = snap.data() as any;
            const fullUser = {
              id: fbUser.uid,
              email: d.email || fbUser.email || '',
              firstName: d.firstName || fbUser.displayName?.split(' ')[0] || 'Member',
              lastName: d.lastName || fbUser.displayName?.split(' ').slice(1).join(' ') || '',
              displayName: d.displayName || fbUser.displayName || 'Member',
              phoneNumber: d.phoneNumber || fbUser.phoneNumber || '',
              photoURL: d.photoURL || fbUser.photoURL || undefined,
              role: (d.role || 'member') as 'member' | 'admin',
              createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
              updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
            };
            console.log('🔍 AuthContext: Setting full user:', fullUser);
            setCurrentUser(fullUser);
          }
          console.log('🔍 AuthContext: Setting loading to false');
          setLoading(false);
          // Signal that user data is ready for other listeners
          setListenersReady(true);
        },
        (err) => {
          console.error('🚨 AuthContext: onSnapshot error occurred:', {
            error: err,
            errorCode: err?.code,
            errorMessage: err?.message,
            errorStack: err?.stack,
            userId: fbUser.uid,
            userRef: userRef.path
          });
          setLoading(false);
          setListenersReady(false); // Reset on error
        }
      );

            console.log('🔍 AuthContext: onSnapshot listener set up successfully');
      docUnsubRef.current = unsubDoc;
    });

    // Provider unmount cleanup
    return () => {
      console.log('🔍 AuthContext: Cleaning up onAuthStateChanged listener');
      unsubAuth();
      if (docUnsubRef.current) {
        console.log('🔍 AuthContext: Cleaning up onSnapshot listener');
        docUnsubRef.current();
      }
      clearRecaptcha();
    };
  }, []);

  // kept for compatibility; ignores the passed id and uses the single global container
  const setupRecaptcha = (): RecaptchaVerifier => getOrCreateRecaptcha();

  const sendVerificationCode = async (phoneNumber: string): Promise<ConfirmationResult> => {
    console.log('🔍 AuthContext: sendVerificationCode called with:', phoneNumber);
    console.log('🔍 AuthContext: USING_EMULATORS:', USING_EMULATORS);
    console.log('🔍 AuthContext: Current hostname:', window.location.hostname);
    console.log('🔍 AuthContext: Current origin:', window.location.origin);
    
    // Emulator path: no reCAPTCHA required, avoids hostname issues entirely
    if (USING_EMULATORS) {
      console.log('🔍 AuthContext: Using emulator mode - no reCAPTCHA needed');
      const fakeVerifier: any = {
        type: 'recaptcha',
        verify: async () => 'test-verifier-token',
      };
      const result = await signInWithPhoneNumber(auth, phoneNumber, fakeVerifier);
      toast.success('Verification code (emulator) generated');
      return result;
    }

    // Real Firebase: use reCAPTCHA
    console.log('🔍 AuthContext: Using real Firebase - setting up reCAPTCHA');
    console.log('🔍 AuthContext: Checking if grecaptcha is available...');
    if (typeof (window as any).grecaptcha === 'undefined') {
      console.error('🚨 AuthContext: reCAPTCHA script not loaded in sendVerificationCode!');
    } else {
      console.log('🔍 AuthContext: grecaptcha is available');
    }
    
    let verifier = getOrCreateRecaptcha();
    console.log('🔍 AuthContext: reCAPTCHA verifier ready, calling signInWithPhoneNumber');
    
    try {
      console.log('🔍 AuthContext: About to call signInWithPhoneNumber with:', {
        phoneNumber,
        verifierType: verifier?.type,
        authApp: auth?.app?.name,
        projectId: auth?.app?.options?.projectId
      });
      
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      console.log('🔍 AuthContext: signInWithPhoneNumber successful');
      console.log('🔍 AuthContext: ConfirmationResult:', {
        verificationId: result.verificationId,
        hasConfirmationResult: !!result,
        resultType: typeof result
      });
      
      // Enhanced SMS delivery logging
      if (result.verificationId) {
        console.log('🔍 AuthContext: SMS should have been sent to:', phoneNumber);
        console.log('🔍 AuthContext: Verification ID:', result.verificationId);
        console.log('🔍 AuthContext: SMS delivery details:');
        console.log('  - Phone Number:', phoneNumber);
        console.log('  - Project ID:', auth.app?.options?.projectId);
        console.log('  - Auth Domain:', auth.app?.options?.authDomain);
        console.log('  - reCAPTCHA Site Key:', process.env.VITE_RECAPTCHA_SITE_KEY);
        console.log('  - Current Domain:', window.location.hostname);
        console.log('  - User Agent:', navigator.userAgent);
        console.log('  - Timestamp:', new Date().toISOString());
        
        // Log to Firebase Analytics for tracking
        if (typeof window !== 'undefined' && (window as any).gtag) {
          (window as any).gtag('event', 'sms_verification_sent', {
            phone_number: phoneNumber,
            verification_id: result.verificationId,
            timestamp: new Date().toISOString()
          });
        }
        
        console.log('🔍 AuthContext: If no SMS received, check:');
        console.log('  1. Firebase Console → Authentication → Usage (SMS quota)');
        console.log('  2. Firebase Console → Authentication → Settings (Phone provider enabled)');
        console.log('  3. Firebase Console → Project Settings → Billing (SMS billing enabled)');
        console.log('  4. Check phone carrier for SMS filtering');
        console.log('  5. Try a different phone number for testing');
      }
      
      toast.success('Verification code sent');
      return result;
    } catch (err: any) {
      console.error('🚨 AuthContext: Phone verification error:', {
        error: err,
        errorCode: err?.code,
        errorMessage: err?.message,
        errorStack: err?.stack
      });
      
      const msg = String(err?.message || '').toLowerCase();

      if (err?.code === 'auth/operation-not-allowed') {
        console.error('🚨 AuthContext: Phone sign-in not enabled in Firebase Console');
        toast.error('Enable Phone sign-in in Firebase Console → Authentication → Sign-in method → Phone.');
      }
      if (err?.code === 'auth/quota-exceeded') {
        console.error('🚨 AuthContext: SMS quota exceeded');
        toast.error('SMS quota exceeded. Check Firebase Console for billing/quota issues.');
      }
      if (err?.code === 'auth/invalid-phone-number') {
        console.error('🚨 AuthContext: Invalid phone number format');
        toast.error('Invalid phone number format. Please check the number and try again.');
      }
      if (err?.code === 'auth/too-many-requests') {
        console.error('🚨 AuthContext: Too many SMS requests');
        toast.error('Too many SMS requests. Please wait before trying again.');
      }
      if (err?.code === 'auth/captcha-check-failed' || msg.includes('hostname match not found')) {
        const host =
          typeof window !== 'undefined' && (window.location?.host || window.location?.hostname)
            ? window.location.host
            : '(unknown host)';
        console.error('🚨 AuthContext: Domain not authorized:', host);
        toast.error(
          `This domain is not authorized: ${host}. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
        );
        throw err;
      }

      // “already rendered” loop → reset & retry once
      if (msg.includes('already been rendered') || msg.includes('already')) {
        try {
          console.log('🔍 AuthContext: reCAPTCHA already rendered error detected, retrying...');
          clearRecaptcha();
          console.log('🔍 AuthContext: reCAPTCHA cleared, creating new verifier');
          const verifier2 = getOrCreateRecaptcha();
          console.log('🔍 AuthContext: New reCAPTCHA verifier ready, retrying signInWithPhoneNumber');
          const result = await signInWithPhoneNumber(auth, phoneNumber, verifier2);
          console.log('🔍 AuthContext: Retry successful');
          toast.success('Verification code sent');
          return result;
        } catch (retryErr: any) {
          console.error('🚨 AuthContext: reCAPTCHA retry failed:', {
            error: retryErr,
            errorCode: retryErr?.code,
            errorMessage: retryErr?.message
          });
          toast.error(retryErr?.message || 'Failed to send verification code');
          throw retryErr;
        }
      }

      console.error('🚨 AuthContext: Final phone verification error:', {
        error: err,
        errorCode: err?.code,
        errorMessage: err?.message
      });
      toast.error(err?.message || 'Failed to send verification code');
      throw err;
    }
  };

  const checkIfUserExists = async (phoneNumber: string): Promise<boolean> => {
    console.log('🔍 AuthContext: checkIfUserExists called with:', phoneNumber);
    
    try {
      // First try Cloud Function
      const functions = getFunctions(app, (import.meta as any).env?.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
      const checkPhoneNumber = httpsCallable(functions, 'checkPhoneNumberExists');
      
      console.log('🔍 AuthContext: Calling Cloud Function to check phone number...');
      const result = await checkPhoneNumber({ phoneNumber });
      
      const exists = (result.data as any)?.exists || false;
      console.log('🔍 AuthContext: Cloud Function result:', { phoneNumber, exists });
      
      if (exists) {
        return true;
      }
      
      // Fallback: Check Firestore directly
      console.log('🔍 AuthContext: Cloud Function says not found, checking Firestore directly...');
      const usersQuery = query(
        collection(db, 'users'),
        where('phoneNumber', '==', phoneNumber)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      const firestoreExists = !usersSnapshot.empty;
      console.log('🔍 AuthContext: Firestore direct check result:', { phoneNumber, firestoreExists, count: usersSnapshot.size });
      
      return firestoreExists;
      
    } catch (error) {
      console.error('🚨 AuthContext: Error checking phone number:', error);
      
      // Final fallback: Check Firestore directly
      try {
        console.log('🔍 AuthContext: Trying Firestore fallback...');
        const usersQuery = query(
          collection(db, 'users'),
          where('phoneNumber', '==', phoneNumber)
        );
        const usersSnapshot = await getDocs(usersQuery);
        
        const fallbackExists = !usersSnapshot.empty;
        console.log('🔍 AuthContext: Firestore fallback result:', { phoneNumber, fallbackExists, count: usersSnapshot.size });
        
        return fallbackExists;
      } catch (fallbackError) {
        console.error('🚨 AuthContext: Firestore fallback also failed:', fallbackError);
        // If all else fails, assume new user for registration
        return false;
      }
    }
  };

  const checkSMSDeliveryStatus = async (phoneNumber: string, verificationId: string): Promise<any> => {
    console.log('🔍 AuthContext: checkSMSDeliveryStatus called with:', { phoneNumber, verificationId });
    
    try {
      const functions = getFunctions(app, (import.meta as any).env?.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
      const checkSMSStatus = httpsCallable(functions, 'checkSMSDeliveryStatus');
      
      console.log('🔍 AuthContext: Calling Cloud Function to check SMS delivery status...');
      const result = await checkSMSStatus({ phoneNumber, verificationId });
      
      console.log('🔍 AuthContext: SMS delivery status result:', result.data);
      return result.data;
    } catch (error) {
      console.error('🚨 AuthContext: Error checking SMS delivery status:', error);
      return {
        success: false,
        error: 'Failed to check SMS delivery status',
        phoneNumber,
        verificationId
      };
    }
  };

  const verifyCode = async (
    confirmationResult: ConfirmationResult,
    code: string,
    firstName: string,
    lastName: string,
    phoneNumber: string,
    isLogin: boolean = false
  ) => {
    console.log('🔍 AuthContext: verifyCode called with:', {
      code,
      firstName,
      lastName,
      phoneNumber,
      isLogin
    });
    console.log('🔍 AuthContext: This is a LOGIN attempt:', isLogin);
    
    try {
      console.log('🔍 AuthContext: Confirming verification code...');
      const cred = await confirmationResult.confirm(code);
      const fbUser = cred.user;
      console.log('🔍 AuthContext: Code confirmed, Firebase user:', {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        phoneNumber: fbUser.phoneNumber
      });
      
      const userRef = doc(db, 'users', fbUser.uid);
      console.log('🔍 AuthContext: User document reference:', userRef.path);
      
      console.log('🔍 AuthContext: Checking if user document exists...');
      const snap = await getDoc(userRef);
      console.log('🔍 AuthContext: User document check result:', {
        exists: snap.exists(),
        hasData: !!snap.data()
      });
      
      console.log('🔍 AuthContext: Processing based on login/registration flow...');
      console.log('🔍 AuthContext: isLogin =', isLogin, ', document exists =', snap.exists());

      if (!snap.exists()) {
        // Only create user document if we have valid data (not empty strings)
        if (firstName.trim() && lastName.trim()) {
          console.log('🔍 AuthContext: Creating new user document...');
          // Create new user with all fields
          const displayName = `${firstName} ${lastName}`.trim();
          const userData = {
            email: fbUser.email || '',
            firstName: firstName,
            lastName: lastName,
            displayName: displayName,
            phoneNumber: phoneNumber,
            role: 'member',
            blockedFromRsvp: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          console.log('🔍 AuthContext: New user data to save:', userData);
          
          await setDoc(userRef, userData);
          console.log('🔍 AuthContext: New user document created successfully');
          toast.success('Account created successfully!');
        } else {
          console.log('🔍 AuthContext: No user document exists and no valid data provided');
          console.log('🔍 AuthContext: firstName =', firstName, ', lastName =', lastName);
          console.log('🔍 AuthContext: This appears to be a new user trying to login - redirecting to registration');
          // For new users, we should redirect them to registration
          // Don't set them as logged in without a profile
          throw new Error('No account found. Please register first.');
        }
      } else if (isLogin) {
        console.log('🔍 AuthContext: Login detected - NOT updating existing user document');
        console.log('🔍 AuthContext: Existing user data will be loaded via onSnapshot');
        toast.success('Welcome back!');
      } else {
        console.log('🔍 AuthContext: Updating existing user document...');
        // Update existing user (only for registration updates)
        const displayName = `${firstName} ${lastName}`.trim();
        const updateData = { 
          firstName: firstName,
          lastName: lastName,
          displayName: displayName,
          phoneNumber: phoneNumber,
          updatedAt: serverTimestamp()
        };
        console.log('🔍 AuthContext: Update data:', updateData);
        
        await updateDoc(userRef, updateData);
        console.log('🔍 AuthContext: User document updated successfully');
        toast.success('Profile updated successfully!');
      }
      console.log('🔍 AuthContext: verifyCode completed successfully, onSnapshot will update UI');
      // onSnapshot updates UI
    } catch (error: any) {
      console.error('🚨 AuthContext: Code verification error:', {
        error,
        errorCode: error?.code,
        errorMessage: error?.message,
        errorStack: error?.stack
      });
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
      console.log('AuthContext: Starting logout...');
      await signOut(auth);
      console.log('AuthContext: Firebase signOut successful');
      toast.success('Logged out successfully');
    } catch (error: any) {
      console.error('AuthContext: Logout error:', error);
      toast.error(error?.message || 'Failed to log out');
      throw error;
    } finally {
      // Always tear down the widget on logout
      clearRecaptcha();
      console.log('AuthContext: reCAPTCHA cleared');
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({ currentUser, loading, listenersReady, sendVerificationCode, verifyCode, checkIfUserExists, checkSMSDeliveryStatus, logout, setupRecaptcha }),
    [currentUser, loading, listenersReady]
  );

  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
