import { collection, getDocs, setDoc, doc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { useTripStore } from '@/store/useTripStore';

export async function createFullBackup(tripId: string, userEmail: string) {
  try {
    const tripProfile = useTripStore.getState().tripProfile;
    
    // Fetch all collections
    const collectionsToBackup = ['tasks', 'expenses', 'locations', 'itinerary', 'group_chat', 'documents', 'aiChats', 'journal'];
    const backupData: any = {
      tripProfile,
      collections: {},
      exportedAt: new Date().toISOString(),
      version: '1.1',
    };

    for (const coll of collectionsToBackup) {
      const snap = await getDocs(collection(db, 'trips', tripId, coll));
      backupData.collections[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Save to firestore under user's backups
    const timestamp = Date.now();
    await setDoc(doc(db, 'users', userEmail, 'backups', `trip_${tripId}_${timestamp}`), {
      data: JSON.stringify(backupData),
      createdAt: timestamp,
      tripId
    });

    console.log('Auto backup completed successfully.');
  } catch (error) {
    console.error('Auto backup failed', error);
  }
}

export async function exportTripToFile(tripId: string) {
  try {
    const tripProfile = useTripStore.getState().tripProfile;
    if (!tripProfile || tripProfile.id !== tripId) {
      throw new Error("Trip profile not loaded or mismatch");
    }

    const collectionsToBackup = ['tasks', 'expenses', 'locations', 'itinerary', 'group_chat', 'documents', 'aiChats', 'journal'];
    const backupData: any = {
      tripProfile,
      collections: {},
      exportedAt: new Date().toISOString(),
      version: '1.2', // incremented for manual export
    };

    for (const coll of collectionsToBackup) {
      const snap = await getDocs(collection(db, 'trips', tripId, coll));
      backupData.collections[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-backup-${tripProfile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Export trip failed', error);
    throw error;
  }
}

export async function restoreTripFromFile(file: File, userEmail: string, userName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const backupData = JSON.parse(text);
        
        if (!backupData.tripProfile || !backupData.collections) {
          throw new Error('Invalid backup file format');
        }

        const oldProfile = backupData.tripProfile;
        const newTripId = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        const newProfile = {
          ...oldProfile,
          id: newTripId,
          participants: [{ email: userEmail, name: userName, role: 'admin' }], // You become the admin of the restored trip
        };

        const batch = writeBatch(db);

        // Write main profile
        const profileRef = doc(db, 'trips', newTripId, 'profile', 'main');
        batch.set(profileRef, newProfile);

        // Write user permissions
        const userRef = doc(db, 'trips', newTripId, 'users', userEmail);
        batch.set(userRef, { email: userEmail, name: userName, role: 'admin' });

        // Write all subcollections
        for (const [collName, docsList] of Object.entries(backupData.collections)) {
          if (Array.isArray(docsList)) {
            for (const item of docsList) {
              const { id, ...data } = item;
              const docRef = doc(db, 'trips', newTripId, collName, id);
              batch.set(docRef, data);
            }
          }
        }

        await batch.commit();

        // Add to user's trips list
        await setDoc(doc(db, 'users', userEmail), {
          trips: arrayUnion({ id: newTripId, name: newProfile.name, destinations: newProfile.destinations })
        }, { merge: true });

        // Set as active trip
        await setDoc(doc(db, 'users', userEmail, 'settings', 'app'), { activeTripId: newTripId }, { merge: true });
        
        // Update store
        useTripStore.getState().setTripProfile(newProfile);
        useTripStore.getState().setCurrentTrip(newTripId);
        
        resolve(newTripId);
      } catch (err) {
        console.error('Restore failed', err);
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
