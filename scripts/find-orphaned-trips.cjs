const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../.agents/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  console.log("Scanning for orphaned trips using collectionGroup...");
  const profilesSnap = await db.collectionGroup('profile').get();
  
  let totalProfiles = 0;
  let orphanedTrips = [];
  let ghostTrips = [];

  for (const profileDoc of profilesSnap.docs) {
    if (profileDoc.id !== 'main') continue; // only look at profile/main
    
    totalProfiles++;
    const tripRef = profileDoc.ref.parent.parent;
    if (!tripRef) continue;
    
    const tripId = tripRef.id;
    const profileData = profileDoc.data();
    const participants = profileData.participants || [];
    
    // Check if the parent trip document actually exists
    const tripDoc = await tripRef.get();
    if (!tripDoc.exists) {
      ghostTrips.push({ tripId, name: profileData.name || 'Unnamed' });
    }
    
    // Check users subcollection
    const usersSnap = await db.collection('trips').doc(tripId).collection('users').get();
    
    if (participants.length === 0 && usersSnap.empty) {
      orphanedTrips.push({ tripId, name: profileData.name || 'Unnamed' });
    }
  }

  console.log(`\n=== Scan Results ===`);
  console.log(`Total trip profiles scanned: ${totalProfiles}`);
  console.log(`Ghost trips (profile exists, but parent trip document deleted): ${ghostTrips.length}`);
  if (ghostTrips.length > 0) {
    ghostTrips.forEach(t => console.log(`- ID: ${t.tripId}, Name: ${t.name}`));
  }
  
  console.log(`Orphaned trips (no participants and empty users subcollection): ${orphanedTrips.length}`);
  if (orphanedTrips.length > 0) {
    orphanedTrips.forEach(t => console.log(`- ID: ${t.tripId}, Name: ${t.name}`));
  }
}

run().catch(console.error);
