import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile, ItineraryDay, ItineraryItem } from '@/store/useTripStore';

interface DocumentExtractionResult {
  itineraryEvents: {
    isoDate: string; // YYYY-MM-DD
    title: string;
    items: {
      type: string;
      text: string;
      fixed?: boolean;
    }[];
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

const DOCUMENT_ANALYZER_PROMPT = `You are an expert data extraction AI.
Analyze the provided document (receipt, invoice, booking confirmation, or text).
Extract:
1. Itinerary Events (e.g., flight times, tour dates). Map them to YYYY-MM-DD.
2. Prepaid Expenses (e.g., the cost of the booking/receipt).
3. Document References (e.g., Booking PNRs, ticket numbers).

Return ONLY valid JSON matching this exact schema:
{
  "itineraryEvents": [
    {
      "isoDate": "YYYY-MM-DD",
      "title": "String",
      "items": [ { "type": "flight|hotel|food|map|note|car|train|ship|ticket", "text": "String", "fixed": true } ]
    }
  ],
  "expenses": [
    { "store": "String", "amount": 100, "currency": "USD", "category": "transportation|hotel|food|other", "notes": "String" }
  ],
  "documents": [
    { "title": "String", "referenceNumber": "String", "notes": "String" }
  ]
}

If no events/expenses/documents are found, return empty arrays.`;

export async function extractAndIntegrateDocument(
  tripProfile: TripProfile,
  days: ItineraryDay[],
  base64Data: string,
  mimeType: string,
  provider: AIProvider,
  authorEmail: string
): Promise<DocumentExtractionResult> {
  const context = `
Trip Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Destinations: ${tripProfile.destinations.join(', ')}
  `;

  // We add base64 image or pdf support
  const text = await callAI(
    [{ role: 'user', text: `Analyze this document. Context: ${context}` }],
    provider,
    { 
      isJson: true, 
      systemInstruction: DOCUMENT_ANALYZER_PROMPT, 
      maxRetries: 2,
      base64Image: base64Data,
      mimeType: mimeType
    }
  );

  const parsed = parseAIJson<DocumentExtractionResult>(text, {
    itineraryEvents: [],
    expenses: [],
    documents: []
  });

  const promises: Promise<any>[] = [];

  // 1. Integrate Itinerary Events
  if (parsed.itineraryEvents && parsed.itineraryEvents.length > 0) {
    for (const event of parsed.itineraryEvents) {
      if (!event.isoDate) continue;
      
      // Find existing day or create a new one
      const existingDay = days.find(d => d.isoDate === event.isoDate);
      
      const newItems: ItineraryItem[] = (event.items || []).map(i => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: i.type || 'note',
        text: i.text,
        fixed: i.fixed || true
      }));

      if (existingDay) {
        // Update existing day
        promises.push(
          updateDoc(doc(db, 'trips', tripProfile.id, 'itinerary', existingDay.docId), {
            items: [...(existingDay.items || []), ...newItems]
          })
        );
      } else {
        // Create new day
        const dObj = new Date(event.isoDate);
        promises.push(
          addDoc(collection(db, 'trips', tripProfile.id, 'itinerary'), {
            id: `day_${event.isoDate}`,
            title: event.title || 'New Day',
            date: !isNaN(dObj.getTime()) ? dObj.toLocaleDateString() : event.isoDate,
            isoDate: event.isoDate,
            items: newItems
          })
        );
      }
    }
  }

  // 2. Expenses
  if (parsed.expenses && parsed.expenses.length > 0) {
    const expensesRef = collection(db, 'trips', tripProfile.id, 'expenses');
    parsed.expenses.forEach(exp => {
      promises.push(addDoc(expensesRef, {
        store: exp.store || 'Document',
        amount: exp.amount || 0,
        currency: exp.currency || 'USD',
        category: exp.category || 'other',
        amountConverted: exp.amount || 0,
        targetCurrency: tripProfile.currency || 'USD',
        notes: exp.notes || 'Imported from document',
        authorEmail,
        createdAt: Date.now()
      }));
    });
  }

  // 3. Documents
  if (parsed.documents && parsed.documents.length > 0) {
    const docsRef = collection(db, 'trips', tripProfile.id, 'documents');
    parsed.documents.forEach(docItem => {
      promises.push(addDoc(docsRef, {
        title: docItem.title,
        referenceNumber: docItem.referenceNumber,
        notes: docItem.notes || '',
        authorEmail,
        createdAt: Date.now()
      }));
    });
  }

  await Promise.all(promises);
  return parsed;
}
