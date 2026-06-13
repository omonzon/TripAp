const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.agents/service-account.json'), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const doc = await db.collection('agent_commands').doc('cASDVgiUSUsKmoiLH8wA').get();
  const data = doc.data();
  if (data.images && data.images.length > 0) {
    let base64 = data.images[0];
    if (base64.startsWith('data:')) {
      base64 = base64.split(',')[1];
    }
    fs.writeFileSync(path.resolve(__dirname, '../artifacts/screenshot.png'), base64, 'base64');
    console.log('Saved screenshot.png');
  } else {
    console.log('No image found');
  }
}
run();
