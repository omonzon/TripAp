import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile, ItineraryDay, ItineraryItem } from '@/store/useTripStore';
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

const STAGE_PROMPTS: Record<WizardStage, string> = {
  origin: 'Suggest 3 starting points (cities or airports) for this trip. Focus on ease of access.',
  regions: 'Suggest 3 high-level route strategies or regions to focus on.',
  sites: 'Suggest 5 must-see attractions or hidden gems that fit this profile.',
  food: 'Suggest 3 culinary strategies or specific iconic restaurants/dishes.',
  hotels: 'Suggest 3 accommodation strategies (e.g. boutique in center, resort, budget).',
  transport: 'Suggest 3 transportation strategies (e.g. rent a car, bullet trains, domestic flights).',
};

export async function suggestWizardOptions(
  stage: WizardStage,
  profile: TripProfile,
  previousAnswers: Partial<WizardAnswers>,
  provider: AIProvider,
  language: string = 'he'
): Promise<string[]> {
  const context = `
Trip: ${profile.destinations.join(', ')}
Pace: ${profile.pace}
Budget: ${profile.budget} ${profile.currency}
Preferences: ${profile.preferences}
Previous choices: ${JSON.stringify(previousAnswers)}
Language: ${language === 'he' ? 'Hebrew' : 'English'}
  `;

  const prompt = `You are a master travel agent. Based on the context, ${STAGE_PROMPTS[stage]}
Return ONLY valid JSON matching this schema:
{
  "suggestions": ["Option 1", "Option 2", "Option 3"]
}`;

  try {
    const result = await callAI(
      [{ role: 'user', text: `${context}\n\n${prompt}` }],
      provider,
      { isJson: true, maxRetries: 2 }
    );
    const parsed = parseAIJson<{ suggestions: string[] }>(result, { suggestions: [] });
    return parsed.suggestions || [];
  } catch (error) {
    console.error('AI suggestion failed', error);
    return [];
  }
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
    return [];
  }
}
