import { doc, getDocs, updateDoc, collection } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { callAI } from '@/services/ai';
import { useAIStore } from '@/store/useAIStore';
import { showToast } from '@/components/ui/Toast';

export async function translateTripContent(tripId: string, targetLanguage: string) {
  try {
    showToast({ type: 'info', message: 'Starting background translation... This may take a minute.' });
    const aiStore = useAIStore.getState();
    const provider = aiStore.getProviderForTask('translation');

    // 1. Translate Tasks
    const tasksSnap = await getDocs(collection(db, 'trips', tripId, 'tasks'));
    let tasksTranslated = 0;
    for (const taskDoc of tasksSnap.docs) {
      const data = taskDoc.data();
      if (data.text) {
        const prompt = `Translate this task text to ${targetLanguage}. Return ONLY the translation:\n${data.text}`;
        const translated = await callAI(prompt, provider);
        if (translated && translated.trim()) {
          await updateDoc(taskDoc.ref, { text: translated.trim() });
          tasksTranslated++;
        }
      }
    }

    // 2. Translate Itinerary Items
    const itinerarySnap = await getDocs(collection(db, 'trips', tripId, 'itinerary'));
    let itemsTranslated = 0;
    for (const dayDoc of itinerarySnap.docs) {
      const data = dayDoc.data();
      if (data.items && Array.isArray(data.items)) {
        const newItems = [...data.items];
        let changed = false;
        for (let i = 0; i < newItems.length; i++) {
          const item = newItems[i];
          if (item.text) {
            const prompt = `Translate this itinerary description to ${targetLanguage}. Return ONLY the translation:\n${item.text}`;
            const translated = await callAI(prompt, provider);
            if (translated && translated.trim()) {
              newItems[i].text = translated.trim();
              changed = true;
              itemsTranslated++;
            }
          }
        }
        if (changed) {
          await updateDoc(dayDoc.ref, { items: newItems });
        }
      }
    }

    showToast({ type: 'success', message: `Translated ${tasksTranslated} tasks and ${itemsTranslated} itinerary items.` });
  } catch (err: any) {
    console.error('Translation error:', err);
    showToast({ type: 'error', message: 'Failed to translate trip content.' });
  }
}
