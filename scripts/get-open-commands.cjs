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
  try {
    const snapshot = await db.collection('agent_commands')
      .orderBy('createdAt', 'asc')
      .get();
      
    const commands = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.status !== 'completed' && data.status !== 'error') {
        commands.push({ id: doc.id, text: data.requestText, status: data.status, createdAt: data.createdAt?.toDate() });
      }
    });

    if (commands.length === 0) {
      console.log("No open commands found.");
    } else {
      console.log(JSON.stringify(commands, null, 2));
    }
    process.exit(0);
  } catch (error) {
    console.error("Error fetching commands:", error);
    process.exit(1);
  }
}

run();
