import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = 'omon.test.mail@gmail.com';
const PASSWORD = process.env.VITE_TEST_ACCOUNT_PASSWORD;

const args = process.argv.slice(2);
const commandId = args[0];
const responseText = args[1] || 'Completed.';

if (!commandId) {
  console.error("Usage: node complete_agent_command.js <commandId> <responseText>");
  process.exit(1);
}

async function run() {
  try {
    await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    await updateDoc(doc(db, 'agent_commands', commandId), {
      status: 'completed',
      response: responseText,
      updatedAt: new Date()
    });
    console.log(`Command ${commandId} marked as completed.`);
    process.exit(0);
  } catch (err) {
    console.error("Error updating command:", err.message);
    process.exit(1);
  }
}

run();
