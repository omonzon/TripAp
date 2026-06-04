import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile, ItineraryDay, ItineraryItem } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type WizardStage = 'origin' | 'regions' | 'sites' | 'food' | 'hotels' | 'transport';

export interface WizardAnswers {
  origin: string;
  regions: string;
  sites: string;
  food: string;
  hotels: string;
  transport: string;
}



export async function generateFinalItinerary(
  profile: TripProfile,
  answers: WizardAnswers,
  provider: AIProvider,
  language: string = 'he'
): Promise<ItineraryDay[]> {
  const context = `
Trip: ${profile.destinations.join(', ')}
Dates: ${profile.startDate} to ${profile.endDate}
Pace: ${profile.pace}
Budget: ${profile.budget} ${profile.currency}
Preferences: ${profile.preferences}
User's explicit choices:
- Start: ${answers.origin}
- Regions: ${answers.regions}
- Sites: ${answers.sites}
- Food: ${answers.food}
- Hotels: ${answers.hotels}
- Transport: ${answers.transport}
Language: ${language === 'he' ? 'Hebrew' : 'English'}
${useAIStore.getState().getUnifiedContext()}
  `;

  // Calculate number of days
  const start = new Date(profile.startDate);
  const end = new Date(profile.endDate);
  const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

  const prompt = `You are an expert itinerary builder. Generate a detailed, day-by-day itinerary for a ${daysDiff}-day trip.
Use the user's explicit choices. Distribute the activities logically.
Item types allowed: flight | hotel | food | map | note | car | train | ship | ticket | home

Return ONLY valid JSON matching this schema:
{
  "days": [
    {
      "title": "Day 1: Arrival & Exploration",
      "items": [
        { "type": "flight", "text": "Arrival at airport" },
        { "type": "food", "text": "Dinner at local spot" }
      ]
    }
  ]
}`;

  try {
    const result = await callAI(
      [{ role: 'user', text: `${context}\n\n${prompt}` }],
      provider,
      { isJson: true, systemInstruction: prompt, maxRetries: 2 }
    );
    
    interface AILawItem { type: string; text: string; }
    interface AILawDay { title: string; items: AILawItem[]; }
    const parsed = parseAIJson<{ days: AILawDay[] }>(result, { days: [] });
    
    // Convert to ItineraryDay matching the store schema
    const generatedDays: ItineraryDay[] = [];
    let currentIsoDate = new Date(profile.startDate);

    for (let i = 0; i < parsed.days.length; i++) {
      const dayData = parsed.days[i];
      const items: ItineraryItem[] = dayData.items.map(item => ({
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: item.type,
        text: item.text,
      }));

      generatedDays.push({
        docId: '', // Filled by firestore
        id: `day_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: dayData.title || `Day ${i + 1}`,
        date: currentIsoDate.toLocaleDateString(),
        isoDate: currentIsoDate.toISOString().split('T')[0],
        order: i,
        items,
      });

      // Increment date
      currentIsoDate.setDate(currentIsoDate.getDate() + 1);
    }
    
    return generatedDays;
  } catch (error) {
    console.error('Itinerary generation failed', error);
    throw error;
  }
}
