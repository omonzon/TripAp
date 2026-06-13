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
  const status = process.argv[3];
  const responseText = process.argv.slice(4).join(' ');

  if (!docId || !status) {
    console.error("Usage: node agent-status.cjs <docId> <status> [responseText]");
    process.exit(1);
  }

  try {
    const updateData = {
      status: status,
      updatedAt: new Date()
    };
    if (responseText) {
      updateData.response = responseText;
    }

    await db.collection('agent_commands').doc(docId).update(updateData);
    console.log(`Successfully updated command ${docId} to status: ${status}`);
    process.exit(0);
  } catch (error) {
    console.error("Error updating command:", error);
    process.exit(1);
  }
}

run();
