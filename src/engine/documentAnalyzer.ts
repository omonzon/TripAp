import { collection, addDoc, doc, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile, ItineraryDay, ItineraryItem } from '@/store/useTripStore';
import i18n from '@/i18n';

export interface DocumentExtractionResult {
  documentTitle?: string;
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
  fullText?: string;
}

const DOCUMENT_ANALYZER_PROMPT = `You are an expert data extraction AI.
Analyze the provided document (receipt, invoice, booking confirmation, or text).
Extract:
1. Itinerary Events (e.g., flight times, tour dates). Map them to YYYY-MM-DD. 
   **CRITICAL**: Group ALL details of a single event (e.g. Tour Name, Meeting Point, Time, Provider, Passengers) into ONE single itinerary item. Do NOT create multiple separate items for the same event. Use HTML formatting inside the 'text' field to organize the details (e.g. <strong>Tour Name</strong><br/>Time: 10:00<br/>Meeting Point: X).
2. Prepaid Expenses (e.g., the cost of the booking/receipt).
3. Document References (e.g., Booking PNRs, ticket numbers).
4. Full Text: Transcribe the complete text from the document.

Return ONLY valid JSON matching this exact schema:
{
  "documentTitle": "String (Generate a smart, descriptive title like '2026-07-15 ALAMO Car Rental' or 'Flight to London')",
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
  ],
  "fullText": "String"
}

If no events/expenses/documents are found, return empty arrays.`;

export async function extractDocumentData(
  tripProfile: TripProfile,
  base64Data: string,
  mimeType: string,
  provider: AIProvider,
  textContent?: string
): Promise<DocumentExtractionResult> {
  const context = `
Trip Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Destinations: ${tripProfile.destinations.join(', ')}
  `;

  const promptText = textContent 
    ? `Analyze this document text. Context: ${context}\n\nDocument Text:\n${textContent}`
    : `Analyze this document. Context: ${context}`;

  const languageInstruction = `\n\nCRITICAL: You MUST translate all extracted text (titles, descriptions, categories, notes, items, etc) to this language code: ${i18n.language}. If the language code is 'he', translate everything to Hebrew. If 'en', English.`;

  // We add base64 image or pdf support
  const text = await callAI(
    [{ role: 'user', text: promptText }],
    provider,
    { 
      isJson: true, 
      systemInstruction: DOCUMENT_ANALYZER_PROMPT + languageInstruction, 
      maxRetries: 2,
      base64Image: textContent ? undefined : base64Data,
      mimeType: textContent ? undefined : mimeType
    }
  );

  const parsed = parseAIJson<DocumentExtractionResult>(text, {
    itineraryEvents: [],
    expenses: [],
    documents: [],
    fullText: ''
  });

  return parsed;
}

export async function integrateDocumentData(
  tripProfile: TripProfile,
  days: ItineraryDay[],
  parsed: DocumentExtractionResult,
  authorEmail: string
): Promise<void> {
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
          setDoc(doc(db, 'trips', tripProfile.id, 'itinerary', `day_${event.isoDate}`), {
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

  // 3. Documents (References and Full Text)
  let finalContent = parsed.fullText ? parsed.fullText.trim() : '';
  
  if (parsed.documents && parsed.documents.length > 0) {
    const refs = parsed.documents.map(d => `**${d.title}**: ${d.referenceNumber || ''} ${d.notes ? `(${d.notes})` : ''}`).join('\n');
    finalContent = finalContent ? `${refs}\n\n---\n\n${finalContent}` : refs;
  }

  if (finalContent) {
    const docsRef = collection(db, 'trips', tripProfile.id, 'documents');
    const title = parsed.documentTitle || (i18n.language === 'he' ? 'מסמך סרוק' : 'Scanned Document');
    
    promises.push(addDoc(docsRef, {
      title,
      content: finalContent,
      authorEmail,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
  }

  await Promise.all(promises);
}
