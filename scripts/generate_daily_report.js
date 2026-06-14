import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const EMAIL = 'omon.test.mail@gmail.com';
const PASSWORD = process.env.VITE_TEST_ACCOUNT_PASSWORD;

function initFirebase() {
  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
  };
  const app = initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getFirestore(app) };
}

export async function runDailyReport(auth, db) {
  try {
    await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    console.log("[Daily Report] Authenticated");

    const platformRef = doc(db, 'platform_settings', 'global');
    const platformSnap = await getDoc(platformRef);
    const pData = platformSnap.exists() ? platformSnap.data() : {};
    const emailjsConfig = pData.emailjsConfig;

    if (!emailjsConfig) {
      console.log("[Daily Report] No EmailJS config found in platform_settings/global.");
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (pData.lastDailyReportDate === todayStr) {
      console.log("[Daily Report] Already sent today.");
      return;
    }

    const usersSnap = await getDocs(collection(db, 'users'));
    const users = usersSnap.docs.map(d => d.data());
    const totalUsers = users.length;

    const uniqueTrips = new Set();
    users.forEach(u => {
      if (u.trips && Array.isArray(u.trips)) {
        u.trips.forEach(t => {
          if (t.id) uniqueTrips.add(t.id);
        });
      }
    });
    const totalTrips = uniqueTrips.size;
    const avgTrips = totalUsers > 0 ? (totalTrips / totalUsers).toFixed(2) : 0;

    const bugsSnap = await getDocs(collection(db, 'bugs'));
    const bugs = bugsSnap.docs.map(d => d.data());
    
    const openBugs = bugs.filter(b => b.status === 'pending' || b.status === 'in_progress');
    const bugCount = openBugs.filter(b => (!b.type || b.type === 'bug')).length;
    const featureCount = openBugs.filter(b => b.type === 'feature').length;

    const emailContent = `
היי מנהל המערכת,
להלן סיכום יומי על סטטוס האפליקציה נכון להיום (${new Date().toLocaleDateString('he-IL')}):

👥 סך הכל משתמשים: ${totalUsers}
✈️ סך הכל טיולים ייחודיים שנוצרו: ${totalTrips}
📊 ממוצע טיולים למשתמש: ${avgTrips}

🐛 באגים פתוחים / בטיפול: ${bugCount}
💡 הצעות ייעול פתוחות / בטיפול: ${featureCount}

סה"כ רשומות במערכת הפניות: ${bugs.length}

יום מוצלח!
מערכת האוטומציה של TripApp
    `.trim();

    console.log("[Daily Report] Sending report...");
    
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Origin': 'https://ai-trip-ap.web.app',
        'Referer': 'https://ai-trip-ap.web.app/'
      },
      body: JSON.stringify({
        service_id: emailjsConfig.serviceId,
        template_id: emailjsConfig.templateId || emailjsConfig.bugTemplateId,
        user_id: emailjsConfig.publicKey,
        template_params: {
          to_name: 'Super Admin',
          from_name: 'TripApp System',
          to_email: 'omonzon@gmail.com',
          message: emailContent
        }
      })
    });

    if (res.ok) {
      console.log("[Daily Report] Email sent successfully!");
      await updateDoc(platformRef, { lastDailyReportDate: todayStr });
    } else {
      console.error("[Daily Report] Failed to send email:", await res.text());
    }
  } catch (err) {
    console.error("[Daily Report] Error:", err);
  }
}

// If run directly (not imported)
if (process.argv[1] && process.argv[1].endsWith('generate_daily_report.js')) {
  const { auth, db } = initFirebase();
  runDailyReport(auth, db).then(() => process.exit(0));
}
