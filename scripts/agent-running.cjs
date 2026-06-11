const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../.agents/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Missing service-account.json");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const docId = process.argv[2];
  if (!docId) {
    console.error("Usage: node agent-running.cjs <docId>");
    process.exit(1);
  }

  try {
    await db.collection('agent_commands').doc(docId).update({
      status: 'running',
      updatedAt: new Date()
    });
    console.log(`Successfully updated command ${docId} to status: running`);
  } catch (error) {
    console.error("Error updating command:", error);
  }
}

run();
