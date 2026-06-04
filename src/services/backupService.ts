import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { useTripStore } from '@/store/useTripStore';

export async function createFullBackup(tripId: string, userEmail: string) {
  try {
    const tripProfile = useTripStore.getState().tripProfile;
    
    // Fetch all collections
    const collectionsToBackup = ['tasks', 'expenses', 'locations', 'messages'];
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
