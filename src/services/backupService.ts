import { collection, getDocs, setDoc, doc, writeBatch, arrayUnion, getDoc } from 'firebase/firestore';
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
      tripId,
      tripName: tripProfile?.name || 'My Trip'
    });

    // Pruning logic: keep 10 latest, plus at least one from yesterday and one from last week
    await pruneBackups(userEmail, tripId);

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
          createdBy: userEmail,
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

async function pruneBackups(userEmail: string, tripId: string) {
  try {
    const backupsSnap = await getDocs(collection(db, 'users', userEmail, 'backups'));
    const allBackups = backupsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(b => b.tripId === tripId)
      .sort((a, b) => b.createdAt - a.createdAt); // newest first

    if (allBackups.length <= 10) return; // No need to prune if we have 10 or fewer

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const startOfYesterday = startOfToday - oneDay;
    const startOfLastWeek = startOfToday - (7 * oneDay);

    let keptYesterday = false;
    let keptLastWeek = false;

    const toKeep = new Set<string>();

    // We definitely want to keep the newest backup overall (index 0)
    toKeep.add(allBackups[0].id);

    for (let i = 1; i < allBackups.length; i++) {
      const b = allBackups[i];
      if (!keptYesterday && b.createdAt >= startOfYesterday && b.createdAt < startOfToday) {
        toKeep.add(b.id);
        keptYesterday = true;
      }
      if (!keptLastWeek && b.createdAt >= startOfLastWeek && b.createdAt < startOfYesterday) {
        toKeep.add(b.id);
        keptLastWeek = true;
      }
    }

    // Fill the rest up to 10
    for (let i = 0; i < allBackups.length; i++) {
      if (toKeep.size >= 10) break;
      toKeep.add(allBackups[i].id);
    }

    // Delete the rest
    const batch = writeBatch(db);
    let deletedCount = 0;
    for (const b of allBackups) {
      if (!toKeep.has(b.id)) {
        batch.delete(doc(db, 'users', userEmail, 'backups', b.id));
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await batch.commit();
      console.log(`Pruned ${deletedCount} old backups for trip ${tripId}`);
    }
  } catch (error) {
    console.error("Failed to prune backups", error);
  }
}

export interface CloudBackup {
  id: string;
  tripId: string;
  tripName: string;
  createdAt: number;
}

export async function getCloudBackups(userEmail: string): Promise<CloudBackup[]> {
  const snap = await getDocs(collection(db, 'users', userEmail, 'backups'));
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      tripId: data.tripId,
      tripName: data.tripName || 'Unknown Trip',
      createdAt: data.createdAt,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

export async function restoreFromCloudBackup(backupId: string, userEmail: string, userName: string): Promise<string> {
  const backupDoc = await getDoc(doc(db, 'users', userEmail, 'backups', backupId));
  if (!backupDoc.exists()) throw new Error('Backup not found');
  
  const backupData = JSON.parse(backupDoc.data().data);
  if (!backupData.tripProfile || !backupData.collections) {
    throw new Error('Invalid backup file format');
  }

  const oldProfile = backupData.tripProfile;
  const newTripId = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  const newProfile = {
    ...oldProfile,
    id: newTripId,
    createdBy: userEmail,
    participants: [{ email: userEmail, name: userName, role: 'admin' }],
  };

  const batch = writeBatch(db);

  const profileRef = doc(db, 'trips', newTripId, 'profile', 'main');
  batch.set(profileRef, newProfile);

  const userRef = doc(db, 'trips', newTripId, 'users', userEmail);
  batch.set(userRef, { email: userEmail, name: userName, role: 'admin' });

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

  useTripStore.getState().setTripProfile(newProfile);
  useTripStore.getState().setCurrentTrip(newTripId);
  
  return newTripId;
}
