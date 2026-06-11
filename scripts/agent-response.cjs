const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const docId = process.argv[2];
const response = process.argv[3];
const status = process.argv[4] || 'completed';

if (!docId) {
  console.error("Usage: node agent-response.cjs <docId> <response> [status]");
  process.exit(1);
}

const serviceAccountPath = path.resolve(__dirname, '../.agents/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  await db.collection('agent_commands').doc(docId).update({
    response: response,
    status: status,
    updatedAt: new Date()
  });
  console.log(`Successfully updated command ${docId} to status: ${status}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Failed to update command:', err);
  process.exit(1);
});
