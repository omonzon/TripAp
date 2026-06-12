import { callAI, type AIProvider } from '@/services/ai';
import type { TripProfile, ItineraryDay } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';

const SOLVER_PROMPT = `You are an expert local travel guide and concierge AI.
Your task is to take a requested task or itinerary item and provide a highly detailed, concrete, and actionable solution.
You must find and recommend REAL places (that exist on Google Maps) whenever possible.

Include the following where applicable:
- Specific recommendations (hotels, flights, cars, attractions, restaurants).
- Opening days and hours (approximate or known).
- Relevance to the user's itinerary/location.
- Arrival directions or transport recommendations.
- Links (use valid Google Maps search links if exact URLs are unknown, e.g., [Name](https://www.google.com/maps/search/?api=1&query=Name)).

Return the solution formatted in clean, beautiful Markdown. Use bullet points, bold text for names, and clear headings.
Do NOT wrap the response in JSON. Return ONLY the Markdown text.`;

export async function solveTaskOrItineraryItem(
  text: string,
  tripProfile: TripProfile,
  days: ItineraryDay[],
  provider: AIProvider,
  language: string = 'he'
): Promise<string> {
  try {
    const itineraryContext = days.map(d => 
      `${d.date} (${d.title}): ${d.items.map(i => i.text).join(' | ')}`
    ).join('\n');

    const context = `
Trip Name: ${tripProfile.name}
Destinations: ${tripProfile.destinations.join(', ')}
Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Pace: ${tripProfile.pace}
Preferences: ${tripProfile.preferences || 'None'}
Language: ${language === 'he' ? 'Hebrew' : 'English'}

Full Itinerary Context:
${itineraryContext}

${useAIStore.getState().getUnifiedContext()}

---
Please provide a concrete solution, recommendations, and actionable details for the following item:
"${text}"
`;

    const result = await callAI(
      [{ role: 'user', text: context }],
      provider,
      { isJson: false, systemInstruction: SOLVER_PROMPT, maxRetries: 2 }
    );

    return result || '';
  } catch (error) {
    console.error('Error solving task/item:', error);
    throw error;
  }
}
