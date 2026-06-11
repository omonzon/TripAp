import { collection, doc, deleteDoc, getDocs, getDoc, updateDoc, query, where, collectionGroup } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Deletes all documents in a specified subcollection of a trip.
 */
async function deleteSubcollection(tripId: string, subcollectionName: string) {
  const q = query(collection(db, 'trips', tripId, subcollectionName));
  const snapshot = await getDocs(q);
  const deletePromises = snapshot.docs.map(document => 
    deleteDoc(doc(db, 'trips', tripId, subcollectionName, document.id))
  );
  await Promise.all(deletePromises);
}

/**
 * Completely deletes a trip, including all its known subcollections and profile.
 */
export async function deleteTripCompletely(tripId: string) {
  const subcollections = [
    'itinerary',
    'expenses',
    'journal',
    'tasks',
    'group_chat',
    'aiChats'
  ];

  for (const subcol of subcollections) {
    await deleteSubcollection(tripId, subcol);
  }

  // Delete the main profile document
  await deleteDoc(doc(db, 'trips', tripId, 'profile', 'main'));
  
  // Delete the trip document itself (though deleting subcollections + profile usually leaves it empty)
  await deleteDoc(doc(db, 'trips', tripId));
}

/**
 * Deletes all trips created by the user, and removes the user from trips they don't own.
 */
export async function deleteAllUserTrips(userEmail: string) {
  const tripsQuery = query(collectionGroup(db, 'users'), where('email', '==', userEmail));
  const tripsSnap = await getDocs(tripsQuery);
  
  for (const tripDoc of tripsSnap.docs) {
    if (!tripDoc.ref.parent.parent || tripDoc.ref.parent.parent.parent.id !== 'trips') continue;
    
    const tripId = tripDoc.ref.parent.parent.id;
    try {
      const profileRef = doc(db, 'trips', tripId, 'profile', 'main');
      const profileSnap = await getDoc(profileRef);
      
      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        const participants = profileData.participants || [];
        const otherParticipants = participants.filter((p: any) => p.email !== userEmail);
        const isCreator = profileData.createdBy === userEmail;

        if (otherParticipants.length === 0) {
          // User is the sole participant, wipe the trip completely
          await deleteTripCompletely(tripId).catch(e => console.warn(`Could not delete trip ${tripId}:`, e));
        } else {
          // There are other participants, just remove the user and transfer ownership if needed
          let newCreatedBy = profileData.createdBy;
          
          if (isCreator) {
            // Transfer ownership to the first available participant
            newCreatedBy = otherParticipants[0].email;
            const newAdminRef = doc(db, 'trips', tripId, 'users', newCreatedBy);
            await updateDoc(newAdminRef, { role: 'admin' }).catch(() => {}); // Make them admin if not already
          }

          await updateDoc(profileRef, { 
            participants: otherParticipants,
            createdBy: newCreatedBy
          }).catch(e => console.warn(`Could not update profile for trip ${tripId}:`, e));
          
          // Remove from users subcollection
          await deleteDoc(doc(db, 'trips', tripId, 'users', userEmail)).catch(e => console.warn(`Could not remove user from trip ${tripId}:`, e));
        }
      }
    } catch (err) {
      console.warn(`Failed to process trip ${tripId} during account deletion:`, err);
    }
  }
}
