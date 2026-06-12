const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');

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
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        if (data.status === 'pending') {
          console.log('\n==================================================');
          console.log('*** NEW PENDING COMMAND RECEIVED FROM FIREBASE ***');
          console.log('DocID:', change.doc.id);
          console.log('Command:', data.requestText);
          console.log('==================================================\n');
          
          if (data.requestText && data.requestText.includes('Please generate a "Daily Summary Report"')) {
            console.log('Intercepting manual summary request... running background script.');
            // Mark as done immediately
            change.doc.ref.update({ status: 'completed' }).catch(console.error);
            exec('node scripts/send-bug-summary.cjs', (err, stdout, stderr) => {
              if (err) console.error('Error running summary script:', err);
              if (stdout) console.log(stdout);
              if (stderr) console.error(stderr);
            });
            // Do not exit! Keep listening.
          } else {
            // Exit to wake up the IDE agent!
            process.exit(0);
          }
        }
      }
    });
  }, error => {
    console.error("Error listening to agentCommands:", error);
  });

// Schedule Daily Summary at 08:00 AM every day
console.log('Scheduling Daily AI Bug Summary for 08:00 AM...');
cron.schedule('0 8 * * *', () => {
  console.log('Running scheduled daily bug summary...');
  exec('node scripts/send-bug-summary.cjs', (err, stdout, stderr) => {
    if (err) console.error('Error running daily summary script:', err);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });
});

// Keep process alive
process.on('SIGINT', () => {
  unsubscribe();
  process.exit();
});
