/**
 * Firebase Auth Service
 * Sets up the onAuthStateChanged listener and syncs to Zustand stores.
 */

import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, onSnapshot
} from 'firebase/firestore';
import { auth, googleProvider, db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
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
          photoURL: firebaseUser.photoURL ?? undefined,
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

    // Check if user has an active trip saved
    const profileRef = doc(db, 'users', firebaseUser.email!, 'settings', 'app');
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const savedTripId = profileSnap.data()?.activeTripId as string | undefined;
      if (savedTripId) {
        useTripStore.getState().setCurrentTrip(savedTripId);
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

export async function signOut() {
  await firebaseSignOut(auth);
  useTripStore.getState().setCurrentTrip(null);
  useTripStore.getState().setTripProfile(null);
}
