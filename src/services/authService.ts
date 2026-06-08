/**
 * Firebase Auth Service
 * Sets up the onAuthStateChanged listener and syncs to Zustand stores.
 */

import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, onSnapshot
} from 'firebase/firestore';
import { auth, googleProvider, db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import type { AppUser } from '@/store/useAuthStore';

export function initFirebaseAuth() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    const { setFirebaseUser, setAppUser, setAuthLoading } = useAuthStore.getState();

    if (!firebaseUser) {
      if ((window as any)._userUnsub) { (window as any)._userUnsub(); }
      setFirebaseUser(null);
      setAppUser(null);
      setAuthLoading(false);
      useTripStore.getState().setCurrentTrip(null);
      return;
    }

    setFirebaseUser(firebaseUser);

    // Look up the user's profile across all trips they belong to
    // For now, check if a global user doc exists under users/{email}
    const userRef = doc(db, 'users', firebaseUser.email!);
    
    if ((window as any)._userUnsub) { (window as any)._userUnsub(); }
    
    (window as any)._userUnsub = onSnapshot(userRef, async (userSnap) => {
      if (!userSnap.exists()) {
        // First-time user — create a basic profile
        const newUser: AppUser = {
          email: firebaseUser.email!,
          name: firebaseUser.displayName ?? firebaseUser.email!.split('@')[0],
          role: 'admin', // First user to sign in becomes admin
          photoURL: firebaseUser.photoURL ?? null,
        };
        await setDoc(userRef, newUser);
        setAppUser(newUser);
      } else {
        const data = userSnap.data();
        setAppUser(data as AppUser);
        if (data && data.trips) {
          useTripStore.getState().setAvailableTrips(data.trips);
        }
      }
    });

    const profileRef = doc(db, 'users', firebaseUser.email!, 'settings', 'app');
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const data = profileSnap.data();
      const savedTripId = data?.activeTripId as string | undefined;
      if (savedTripId) {
        useTripStore.getState().setCurrentTrip(savedTripId);
      }
      
      // Sync global settings from cloud
      if (data.emailjsConfig) useAuthStore.getState().setEmailjsConfig(data.emailjsConfig);
      if (data.language) useAuthStore.getState().setLanguage(data.language);
      if (data.fontSize) useAuthStore.getState().setFontSize(data.fontSize);
      if (data.autoBackupInterval !== undefined) useAuthStore.getState().setAutoBackupInterval(data.autoBackupInterval);
      if (data.isDarkMode !== undefined) {
         useAuthStore.setState({ isDarkMode: data.isDarkMode });
         if (data.isDarkMode) document.documentElement.classList.add('dark');
         else document.documentElement.classList.remove('dark');
      }
      
      if (data.aiSettings) {
         const ai = data.aiSettings;
         if (ai.providerType) useAIStore.getState().setProvider(ai.providerType);
         if (ai.apiKey) useAIStore.getState().setApiKey(ai.apiKey);
         if (ai.models) useAIStore.setState({ models: ai.models });
      }
    }

    setAuthLoading(false);
  });
}

export async function signInWithGoogle() {
  const { setLoginError, setAuthLoading } = useAuthStore.getState();
  setAuthLoading(true);
  setLoginError(null);
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, googleProvider);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Sign in failed';
    setLoginError(msg);
    setAuthLoading(false);
  }
}

export async function signInWithTestAccount() {
  const { setLoginError, setAuthLoading } = useAuthStore.getState();
  setAuthLoading(true);
  setLoginError(null);
  try {
    await signInWithEmailAndPassword(auth, 'omon.test.mail@gmail.com', 'CMjWfQinNHWqwHQtN1eqPy');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Test sign in failed';
    setLoginError(msg);
    setAuthLoading(false);
  }
}

export async function signOut() {
  await firebaseSignOut(auth);
  useTripStore.getState().setCurrentTrip(null);
  useTripStore.getState().setTripProfile(null);
}

export async function syncUserSettingsToCloud() {
  const { appUser, emailjsConfig, language, isDarkMode, fontSize, autoBackupInterval } = useAuthStore.getState();
  const { providerType, apiKey, models } = useAIStore.getState();
  
  if (!appUser) return;
  const profileRef = doc(db, 'users', appUser.email, 'settings', 'app');
  await setDoc(profileRef, {
    emailjsConfig: emailjsConfig || null,
    language,
    isDarkMode,
    fontSize,
    autoBackupInterval,
    aiSettings: {
      providerType,
      apiKey,
      models
    }
  }, { merge: true });
}
