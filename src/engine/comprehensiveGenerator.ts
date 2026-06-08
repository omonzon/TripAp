import { collection, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile } from '@/store/useTripStore';

export interface ComprehensiveOutput {
  itinerary: {
    isoDate: string;
    title: string;
    items: {
      type: string;
      text: string;
      fixed?: boolean;
      flightData?: Record<string, string>;
      referrals?: { title: string; url: string; icon?: string }[];
    }[];
  }[];
  tasks: {
    text: string;
    category: string;
    priority: 'low' | 'medium' | 'high';
  }[];
  expenses: {
    store: string;
    amount: number;
    currency: string;
    category: string;
    notes?: string;
  }[];
  documents: {
    title: string;
    referenceNumber: string;
    notes?: string;
  }[];
}

const COMPREHENSIVE_PROMPT = `You are an expert travel planner AI and data extraction engine.
You will be given a trip profile, user preferences, and potentially raw bookings/documents text.

Your job is to generate a MASSIVE comprehensive trip JSON with 4 sections:
1. "itinerary": An array of days. Each day MUST have an "isoDate" (YYYY-MM-DD), a "title" (e.g. "Day 1: Arrival"), and "items". Each item must have a "type" (flight|hotel|food|map|note|car|train|ship|ticket|home) and "text" (description). If it's a pre-booked flight or hotel from the text, set "fixed": true.
2. "tasks": A list of 10-15 smart tasks (Pre-trip, Packaging, Bookings, Documents, During Trip, Post-trip). Use these EXACT categories.
3. "expenses": Extract any prepaid expenses from the documents (e.g., flight cost, hotel cost). Provide "store", "amount" (number), "currency" (USD, EUR, ILS, etc.), and "category" (transportation|hotel|food|other).
4. "documents": Extract any booking reference numbers, PNRs, or confirmation codes.

Language rule: Translate all generated text (itinerary descriptions, task texts, document titles) into the requested language (Hebrew or English).
The keys of the JSON must remain in English.

CRITICAL RULE FOR ITINERARY TEXT: Do NOT duplicate the 'title' inside the 'text'. The 'text' should only contain the description of the activity. Do NOT repeat the location name twice in the text.

Return ONLY valid JSON matching this exact schema:
{
  "itinerary": [
    {
      "isoDate": "YYYY-MM-DD",
      "title": "String",
      "items": [ 
        { 
          "type": "flight", 
          "text": "String", 
          "fixed": true,
          "referrals": [ { "title": "short search title", "url": "precise URL with dates/pax" } ]
        } 
      ]
    }
  ],
  "tasks": [
    {
      "text": "String",
      "category": "String",
      "priority": "low|medium|high"
    }
  ],
  "expenses": [
    {
      "store": "String",
      "amount": Number,
      "currency": "String",
      "category": "String",
      "notes": "String (optional)"
    }
  ],
  "documents": [
    {
      "title": "String",
      "referenceNumber": "String",
      "notes": "String (optional)"
    }
  ]
}

CRITICAL: Include the exact dates and participant counts in the URL query strings for referrals to make the links precise! Use the dates and participants from the provided context.
IMPORTANT: Do NOT include the entire activity text in the search queries! Use concise keywords (e.g., just the city name or flight route).
- Car rental: https://www.expedia.com/carsearch?locn=CITY_NAME&d1=YYYY-MM-DD&d2=YYYY-MM-DD
- Hotel: https://www.booking.com/searchresults.html?ss=CITY_NAME&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=N
- Expedia: https://www.expedia.com/Hotel-Search?destination=CITY_NAME&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&adults=N
- Flights: https://www.google.com/travel/flights?q=Flights%20CITY_NAME%20ACTIVITY
- Tours/Activities/Ski/Diving: https://www.viator.com/searchResults/all?text=CITY_NAME+ACTIVITY`;

export async function generateComprehensiveTrip(
  tripProfile: TripProfile,
  documentsText: string,
  provider: AIProvider,
  language: string = 'he',
  authorEmail: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const context = `
Trip Name: ${tripProfile.name}
Destinations: ${tripProfile.destinations.join(', ')}
Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Pace: ${tripProfile.pace}
Language: ${language === 'he' ? 'Hebrew' : 'English'}

Preferences / Free text:
${tripProfile.preferences}

Raw Documents / Bookings:
${documentsText}
`;

  try {
    if (onProgress) onProgress(language === 'he' ? 'קורא נתונים ומסמכים...' : 'Reading data and documents...');
    let affiliateLinks = '';
    try {
      const snap = await getDoc(doc(db, 'platform_settings', 'affiliates'));
      if (snap.exists() && snap.data().links) {
        affiliateLinks = JSON.stringify(snap.data().links);
      }
    } catch(e) {}

    const promptInstruction = COMPREHENSIVE_PROMPT + (affiliateLinks ? `\n\nCRITICAL: When recommending hotels, flights, cars, attractions, or restaurants, you MUST include a direct booking link. Combine your search parameters with these affiliate base links: ${affiliateLinks}. Make sure bad reviews don't contradict user requests, and place the final booking link right inside the item's text.` : '');

    if (onProgress) onProgress(language === 'he' ? 'מכין מסלול מדהים (זה עשוי לקחת כדקה)...' : 'Preparing amazing route (may take a minute)...');
    const result = await callAI(
      [{ role: 'user', text: `Generate comprehensive trip data:\n${context}` }],
      provider,
      { isJson: true, systemInstruction: promptInstruction, maxRetries: 2 }
    );

    if (onProgress) onProgress(language === 'he' ? 'מפענח את התוצאות...' : 'Parsing results...');
    const parsed = parseAIJson<ComprehensiveOutput>(result, {
      itinerary: [], tasks: [], expenses: [], documents: []
    });

    // Tag items with AI author
    parsed.itinerary = parsed.itinerary.map(day => ({
      ...day,
      items: day.items.map(item => ({ ...item, authorName: 'AI' }))
    }));

    const tripRef = doc(db, 'trips', tripProfile.id);
    const promises: Promise<any>[] = [];

    if (onProgress) onProgress(language === 'he' ? 'שומר מסלול ומשימות...' : 'Saving itinerary and tasks...');

    // 1. Itinerary
    if (parsed.itinerary && Array.isArray(parsed.itinerary)) {
      const itRef = collection(db, 'trips', tripProfile.id, 'itinerary');
      parsed.itinerary.forEach(day => {
        const dObj = new Date(day.isoDate);
        if (isNaN(dObj.getTime())) return;
        
        const dayPayload = {
          id: `day_${day.isoDate}`,
          title: day.title,
          date: dObj.toLocaleDateString(),
          isoDate: day.isoDate,
          items: (day.items || []).map(item => ({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: item.type || 'note',
            text: item.text || '',
            fixed: item.fixed || false,
            referrals: item.referrals || []
          }))
        };
        // Use setDoc to use the isoDate as docId for predictable sorting if we want,
        // but addDoc is safer to avoid overwriting. Wait, the current app uses addDoc with auto ID.
        promises.push(addDoc(itRef, dayPayload));
      });
    }

    // 2. Tasks
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      const tasksRef = collection(db, 'trips', tripProfile.id, 'tasks');
      parsed.tasks.forEach(task => {
        promises.push(addDoc(tasksRef, {
          text: task.text,
          completed: false,
          category: task.category,
          priority: task.priority,
          authorEmail,
          createdAt: Date.now() + Math.floor(Math.random() * 1000)
        }));
      });
    }

    // 3. Expenses
    if (parsed.expenses && Array.isArray(parsed.expenses)) {
      const expensesRef = collection(db, 'trips', tripProfile.id, 'expenses');
      parsed.expenses.forEach(exp => {
        // Simple conversion fallback (1:1) since we don't have rates here.
        // It's better if they edit it later to fix conversion if they want.
        promises.push(addDoc(expensesRef, {
          store: exp.store || 'Expense',
          amount: exp.amount || 0,
          currency: exp.currency || 'USD',
          category: exp.category || 'other',
          amountConverted: exp.amount || 0, // Placeholder
          targetCurrency: tripProfile.currency || 'USD',
          notes: exp.notes || '',
          authorEmail,
          createdAt: Date.now() + Math.floor(Math.random() * 1000)
        }));
      });
    }

    // 4. Documents (We'll store them in a new 'documents' subcollection)
    if (parsed.documents && Array.isArray(parsed.documents)) {
      const docsRef = collection(db, 'trips', tripProfile.id, 'documents');
      parsed.documents.forEach(docItem => {
        promises.push(addDoc(docsRef, {
          title: docItem.title,
          referenceNumber: docItem.referenceNumber,
          notes: docItem.notes || '',
          authorEmail,
          createdAt: Date.now() + Math.floor(Math.random() * 1000)
        }));
      });
    }

    await Promise.all(promises);
  } catch (error) {
    console.error('Error generating comprehensive trip:', error);
    throw error;
  }
}
