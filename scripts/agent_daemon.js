import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs } from 'firebase/firestore';

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

if (!PASSWORD) {
  console.error("ERROR: VITE_TEST_ACCOUNT_PASSWORD is not set in .env.local.");
  process.exit(1);
}

// Function to recursively get the most recent modification time in a directory
function getLatestMtime(dirPath) {
  let latestMtime = 0;
  
  if (!fs.existsSync(dirPath)) return 0;
  
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
      const childMtime = getLatestMtime(fullPath);
      if (childMtime > latestMtime) latestMtime = childMtime;
    } else {
      if (stats.mtimeMs > latestMtime) latestMtime = stats.mtimeMs;
    }
  }
  return latestMtime;
}

async function startDaemon() {
  try {
    await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    console.log(`[Daemon] Authenticated as ${EMAIL}`);
  } catch (err) {
    console.error("[Daemon] Auth failed:", err.message);
    process.exit(1);
  }

  // Fetch initial interval
  let agentListenIntervalMinutes = 10;
  const platformSnap = await getDoc(doc(db, 'platform_settings', 'global'));
  if (platformSnap.exists() && platformSnap.data().agentListenInterval) {
    agentListenIntervalMinutes = platformSnap.data().agentListenInterval;
  }

  // Listen to interval changes
  onSnapshot(doc(db, 'platform_settings', 'global'), (doc) => {
    if (doc.exists() && doc.data().agentListenInterval) {
      agentListenIntervalMinutes = doc.data().agentListenInterval;
      console.log(`[Daemon] Updated listen interval to ${agentListenIntervalMinutes} minutes.`);
    }
  });

  const commandsRef = collection(db, 'agent_commands');
  const q = query(commandsRef, where('status', '==', 'pending'));

  let activeTasks = new Set();
  
  // Checking loop for delayed tasks
  setInterval(async () => {
    if (activeTasks.size === 0) return;
    
    // Fetch all pending to see if any are ready
    const snap = await getDocs(q);
    snap.docs.forEach(async (docSnap) => {
      await processTask(docSnap);
    });
  }, 60 * 1000); // check every minute

  console.log("[Daemon] Listening for pending commands...");
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const docSnap = change.doc;
        activeTasks.add(docSnap.id);
        await processTask(docSnap);
      }
      if (change.type === 'removed') {
        activeTasks.delete(change.doc.id);
      }
    });
  });

  async function processTask(docSnap) {
    const data = docSnap.data();
    if (data.status !== 'pending') return;

    const srcDir = path.join(__dirname, '../src');
    const latestMtime = getLatestMtime(srcDir);
    const now = Date.now();
    const timeSinceLastEdit = now - latestMtime;
    const requiredDelay = agentListenIntervalMinutes * 60 * 1000;

    if (timeSinceLastEdit < requiredDelay) {
      // User is active, delay
      const remainingMinutes = Math.ceil((requiredDelay - timeSinceLastEdit) / 60000);
      console.log(`[Daemon] Task ${docSnap.id} pending. User active recently. Waiting ~${remainingMinutes}m.`);
      return;
    }

    // Process the task!
    console.log(`[Daemon] Processing task: ${docSnap.id}`);
    try {
      await updateDoc(docSnap.ref, { status: 'running', updatedAt: new Date() });
      activeTasks.delete(docSnap.id);
      
      // Print the magic string that wakes up the Agent!
      console.log(`\n================================`);
      console.log(`AGENT_COMMAND_RECEIVED`);
      console.log(JSON.stringify({
        id: docSnap.id,
        requestText: data.requestText
      }));
      console.log(`================================\n`);
      
    } catch (e) {
      console.error("[Daemon] Failed to update task status:", e);
    }
  }
}

startDaemon();
