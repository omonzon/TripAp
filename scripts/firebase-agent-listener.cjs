const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../.agents/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

console.log("Firebase Agent Listener is running in the background.");
console.log("Listening for new commands from ANY device via Firebase...");

// Keep track of docs we've already seen to prevent firing on initial load
let initialLoad = true;

const unsubscribe = db.collection('agent_commands')
  .where('status', '==', 'pending')
  .onSnapshot(snapshot => {
    if (initialLoad) {
      initialLoad = false;
      return; // Skip the initial snapshot which contains existing pending commands
    }

    snapshot.docChanges().forEach(change => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        if (data.status === 'pending') {
          console.log('\n==================================================');
          console.log('*** NEW USER COMMAND RECEIVED FROM FIREBASE ***');
          console.log('DocID:', change.doc.id);
          console.log('Command:', data.requestText);
          console.log('==================================================\n');
          
          // Acknowledge the command so it moves to "running" state
          change.doc.ref.update({
            status: 'running',
            updatedAt: new Date()
          }).catch(err => console.error("Failed to update status to running:", err));
        }
      }
    });
  }, error => {
    console.error("Error listening to agent_commands:", error);
  });

// Keep process alive
process.on('SIGINT', () => {
  unsubscribe();
  process.exit();
});
