import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docId = process.argv[2];
const response = process.argv[3];
const status = process.argv[4] || 'completed';

if (!docId) {
  console.error("Usage: node agent-response.js <docId> <response> [status]");
  process.exit(1);
}

const serviceAccountPath = path.resolve(__dirname, '../.agents/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  await db.collection('agent_commands').doc(docId).update({
    response: response,
    status: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`Successfully updated command ${docId} to status: ${status}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Failed to update command:', err);
  process.exit(1);
});
