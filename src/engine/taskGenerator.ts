import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';

export interface GeneratedTask {
  text: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
}

const TASK_GENERATION_PROMPT = `You are an expert travel planner AI. 
Based on the provided trip profile and context, generate a comprehensive list of 15-20 essential tasks covering the entire trip lifecycle.

Include smart suggestions based on the specific destination, pace, and preferences. 
Specifically include items for:
1. Planning: general planning, itineraries, research.
2. Pre-trip: Bookings, documents, packaging, tailored to this destination and climate.
3. During Trip: Things to do, logistical reminders, location-based tasks.

IMPORTANT: Do NOT generate tasks that are already in the existing tasks list provided below.

Group them into these specific categories (use exactly these strings for the category field):
- "planning"
- "pre_trip"
- "during_trip"

Assign a priority ('low', 'medium', 'high') to each task.
Write the task 'text' in the language requested. 

Return ONLY valid JSON matching this schema:
{
  "tasks": [
    { "text": "Task description here", "category": "planning", "priority": "high" }
  ]
}`;

export async function generateTripTasks(
  tripProfile: TripProfile,
  provider: AIProvider,
  language: string = 'he',
  authorEmail: string,
  existingTasks: string[] = []
): Promise<void> {
  try {
    const context = `
Trip Name: ${tripProfile.name}
Destinations: ${tripProfile.destinations.join(', ')}
Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Pace: ${tripProfile.pace}
Language: ${language === 'he' ? 'Hebrew' : 'English'}
Existing Tasks: ${existingTasks.length > 0 ? existingTasks.join(', ') : 'None'}
${useAIStore.getState().getUnifiedContext()}
`;

    const result = await callAI(
      [{ role: 'user', text: `Generate tasks for this trip:\n${context}` }],
      provider,
      { isJson: true, systemInstruction: TASK_GENERATION_PROMPT, maxRetries: 2 }
    );

    const parsed = parseAIJson<{ tasks: GeneratedTask[] }>(result, { tasks: [] });
    
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      // Write all tasks to firestore
      const tasksRef = collection(db, 'trips', tripProfile.id, 'tasks');
      const promises = parsed.tasks.map(task => 
        addDoc(tasksRef, {
          text: task.text,
          completed: false,
          category: task.category,
          priority: task.priority,
          authorEmail,
          createdAt: Date.now() + Math.floor(Math.random() * 1000), // Slightly offset timestamps
        })
      );
      
      await Promise.all(promises);
    }
  } catch (error) {
    console.error('Error generating trip tasks:', error);
  }
}
