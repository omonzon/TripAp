import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { callAI, parseAIJson, type AIProvider } from '@/services/ai';
import type { TripProfile } from '@/store/useTripStore';

export interface GeneratedTask {
  text: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
}

const TASK_GENERATION_PROMPT = `You are an expert travel planner AI. 
Based on the provided trip profile, generate a list of 10-15 essential and highly relevant tasks that need to be done before or during the trip.

Group them into these specific categories (use exactly these strings):
- אריזה (Packaging)
- הזמנות (Ordering/Bookings)
- תכנון (Planning)
- מסמכים (Documents)
- כללי (General)

Assign a priority ('low', 'medium', 'high') to each task.
Write the task 'text' in the language requested. 

Return ONLY valid JSON matching this schema:
{
  "tasks": [
    { "text": "Task description here", "category": "אריזה", "priority": "high" }
  ]
}`;

export async function generateTripTasks(
  tripProfile: TripProfile,
  provider: AIProvider,
  language: string = 'he',
  authorEmail: string
): Promise<void> {
  try {
    const context = `
Trip Name: ${tripProfile.name}
Destinations: ${tripProfile.destinations.join(', ')}
Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Pace: ${tripProfile.pace}
Preferences: ${tripProfile.preferences}
Language for tasks: ${language === 'he' ? 'Hebrew' : 'English'}
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
