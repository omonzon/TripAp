/**
 * Firebase Auth Service
 * Sets up the onAuthStateChanged listener and syncs to Zustand stores.
 */

import {
  onAuthStateChanged,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, onSnapshot, collectionGroup, query, where
} from 'firebase/firestore';
import { auth, googleProvider, db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import type { AppUser } from '@/store/useAuthStore';
import { showToast } from '@/components/ui/Toast';

export function initFirebaseAuth() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    const { setFirebaseUser, setAppUser, setAuthLoading } = useAuthStore.getState();

    if (!firebaseUser) {
      if ((window as any)._userUnsub) { (window as any)._userUnsub(); }
      if ((window as any)._tripsUnsub) { (window as any)._tripsUnsub(); }
      setFirebaseUser(null);
      setAppUser(null);
      setAuthLoading(false);
      useTripStore.getState().setCurrentTrip(null);
      useTripStore.getState().setAvailableTrips([]);
      useAIStore.getState().setApiKey('');
      return;
    }

    setFirebaseUser(firebaseUser);

    // Look up the user's profile across all trips they belong to
    // For now, check if a global user doc exists under users/{email}
    const userRef = doc(db, 'users', firebaseUser.email!);
    
    (window as any)._userUnsub = onSnapshot(userRef, async (userSnap) => {
      if (!userSnap.exists() || !(userSnap.data() as AppUser).email) {
        const newUser: AppUser = {
          email: firebaseUser.email!,
          name: firebaseUser.displayName ?? firebaseUser.email!.split('@')[0],
          role: 'admin',
          createdAt: Date.now(),
          ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
        };
        await setDoc(userRef, newUser, { merge: true });
        
        const existingData = userSnap.exists() ? userSnap.data() : {};
        const mergedUser = { ...existingData, ...newUser } as AppUser;
        setAppUser(mergedUser);
      } else {
        const data = userSnap.data() as AppUser;
        if (data.isBlocked) {
          showToast({ type: 'error', message: 'Your account has been blocked by the administrator.' });
        }
        setAppUser(data);
      }
    });

    // Collection Group Query for Trips
    const tripsQuery = query(collectionGroup(db, 'users'), where('email', '==', firebaseUser.email!));
    if ((window as any)._tripsUnsub) { (window as any)._tripsUnsub(); }
    
    (window as any)._tripsUnsub = onSnapshot(tripsQuery, async (snap) => {
      const tripsPromises = snap.docs.map(async (d) => {
        if (d.ref.parent.parent && d.ref.parent.parent.parent.id === 'trips') {
          const tripId = d.ref.parent.parent.id;
          const profileSnap = await getDoc(doc(db, 'trips', tripId, 'profile', 'main'));
          if (profileSnap.exists()) {
            return { 
              id: tripId, 
              name: profileSnap.data().name || 'Unknown',
              destinations: profileSnap.data().destinations || []
            };
          }
        }
        return null;
      });
      
      const tripsResults = await Promise.all(tripsPromises);
      const availableTrips = tripsResults.filter(t => t !== null) as {id: string, name: string, destinations: string[]}[];
      useTripStore.getState().setAvailableTrips(availableTrips);

      const currentTripId = useTripStore.getState().currentTripId;
      if ((!currentTripId || currentTripId === 'new') && availableTrips.length > 0) {
        useTripStore.getState().setCurrentTrip(availableTrips[0].id);
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
      if (data.aiSetupDismissed !== undefined) {
         useAuthStore.getState().setAiSetupDismissed(data.aiSetupDismissed);
      }
    }

    // Fetch global platform settings (like EmailJS configured by super admin)
    try {
      const platformRef = doc(db, 'platform_settings', 'global');
      const platformSnap = await getDoc(platformRef);
      if (platformSnap.exists()) {
        const pData = platformSnap.data();
        if (pData.emailjsConfig) useAuthStore.getState().setEmailjsConfig(pData.emailjsConfig);
      }
    } catch (e) {
      console.error("Failed to fetch platform settings", e);
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
    await signInWithRedirect(auth, googleProvider);
  } catch (err: any) {
    console.error("Google sign in error:", err);
    setLoginError(err?.message || 'Sign in failed');
    setAuthLoading(false);
  }
}

export async function signInWithTestAccount() {
  const { setLoginError, setAuthLoading } = useAuthStore.getState();
  setAuthLoading(true);
  setLoginError(null);
  try {
    await signInWithEmailAndPassword(auth, 'omon.test.mail@gmail.com', 'CMjWfQinNHWqwHQtN1eqPy');
  } catch (err: any) {
    const msg = err?.message || 'Test sign in failed';
    setLoginError(msg);
  } finally {
    setAuthLoading(false);
  }
}

export async function signOut() {
  await firebaseSignOut(auth);
  useTripStore.getState().setCurrentTrip(null);
  useTripStore.getState().setTripProfile(null);
  useTripStore.getState().setAvailableTrips([]);
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

  if (appUser.email === 'omonzon@gmail.com' && emailjsConfig) {
    try {
      await setDoc(doc(db, 'platform_settings', 'global'), { emailjsConfig }, { merge: true });
    } catch(e) { console.error("Failed to sync global EmailJS config", e); }
  }
}
