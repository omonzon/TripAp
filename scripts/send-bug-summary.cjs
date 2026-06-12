require('dotenv').config({ path: '.env.local' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
  try {
    // 1. Initialize Firebase
    const serviceAccountPath = path.resolve(__dirname, '../.agents/service-account.json');
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('Service account not found. Cannot connect to Firestore.');
      return;
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
    const db = getFirestore();

    // 2. Fetch config for EmailJS
    const platformSnap = await db.collection('platform_settings').doc('global').get();
    const platformData = platformSnap.exists ? platformSnap.data() : {};
    // Wait, the client uses useAuthStore which saves emailjsConfig in 'users/omonzon@gmail.com/settings'. Let's check there instead!
    const userSnap = await db.collection('users').doc('omonzon@gmail.com').get();
    const emailjsConfig = userSnap.exists ? userSnap.data()?.settings?.emailjsConfig : null;

    if (!emailjsConfig || !emailjsConfig.serviceId || !emailjsConfig.publicKey || !emailjsConfig.templateId) {
      console.error('EmailJS config missing for Super Admin.');
      return;
    }

    // 3. Fetch all open bugs/features
    console.log('Fetching open bugs and features...');
    const bugsSnap = await db.collection('bugs').get();
    const openItems = bugsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(b => b.status === 'pending' || b.status === 'in_progress' || !b.status);

    if (openItems.length === 0) {
      console.log('No open bugs or features. Exiting.');
      return;
    }

    const bugs = openItems.filter(i => i.type !== 'feature');
    const features = openItems.filter(i => i.type === 'feature');

    const rawDataText = `
BUGS:
${bugs.map(b => `- From: ${b.userId}\n  Text: ${b.text}\n  Notes: ${b.adminNotes || 'None'}`).join('\n\n')}

FEATURE REQUESTS:
${features.map(f => `- From: ${f.userId}\n  Text: ${f.text}\n  Notes: ${f.adminNotes || 'None'}`).join('\n\n')}
`;

    // 4. Summarize with Gemini
    console.log('Summarizing with Gemini...');
    const apiKey = process.env.VITE_FIREBASE_API_KEY; // We'll try to find a gemini key. Or we can just use the user's saved key!
    const aiSnap = await db.collection('users').doc('omonzon@gmail.com').get();
    const geminiKey = aiSnap.exists ? aiSnap.data()?.settings?.aiApiKey : process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      console.error('No Gemini API Key found in env or user settings.');
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const prompt = `You are an expert product manager analyzing user feedback. 
Here are the open bugs and feature requests from the platform:

${rawDataText}

Please generate a professional "Daily Summary Report" in Hebrew. 
Instructions:
1. For Bugs: Group by severity, summarize the issues briefly.
2. For Feature Requests: Give a score (1-10) for each request based on estimated usefulness/impact, and summarize them.
3. Keep it well-formatted with markdown and clear sections. Use emojis appropriately.`;

    const result = await model.generateContent(prompt);
    const summaryHtml = result.response.text().replace(/\n/g, '<br/>');

    // 5. Send Email via EmailJS REST API
    console.log('Sending email...');
    const emailData = {
      service_id: emailjsConfig.serviceId,
      template_id: emailjsConfig.templateId, // or bugTemplateId if we had one
      user_id: emailjsConfig.publicKey,
      template_params: {
        to_email: 'omonzon@gmail.com',
        to_name: 'Super Admin',
        title: 'Daily AI Bug & Feature Summary',
        message: summaryHtml
      }
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData)
    });

    if (res.ok) {
      console.log('Daily Summary Sent Successfully!');
    } else {
      const errText = await res.text();
      console.error('Failed to send email:', errText);
    }

  } catch (error) {
    console.error('Error generating summary:', error);
  }
}

run();
