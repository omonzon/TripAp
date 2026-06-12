import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Wand2, Loader2, DollarSign, Wallet, MapPin, Coffee, Car, Ticket } from 'lucide-react';
import { callAI, parseAIJson } from '@/services/ai';
import { useAIStore } from '@/store/useAIStore';
import { useTripStore } from '@/store/useTripStore';
import { db } from '@/services/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { showToast } from '@/components/ui/Toast';

interface AIBudgetEstimationModalProps {
  onClose: () => void;
}

interface BudgetEstimate {
  total: number;
  currency: string;
  categories: {
    flights: number;
    accommodation: number;
    food: number;
    transportation: number;
    attractions: number;
    other: number;
  };
  reasoning: string;
}

export default function AIBudgetEstimationModal({ onClose }: AIBudgetEstimationModalProps) {
  const { t } = useTranslation();
  const { currentTripId, tripProfile, isOnline } = useTripStore();
  const { getProviderForTask } = useAIStore();
  
  const [style, setStyle] = useState<'budget' | 'standard' | 'luxury'>('standard');
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimate, setEstimate] = useState<BudgetEstimate | null>(null);

  const handleEstimate = async () => {
    if (!currentTripId || !tripProfile) return;
    
    setIsEstimating(true);
    try {
      // Fetch itinerary to give AI context
      const q = query(collection(db, 'trips', currentTripId, 'itinerary'), orderBy('isoDate', 'asc'));
      const snap = await getDocs(q);
      const days = snap.docs.map(d => d.data());

      const prompt = `You are an expert travel budget estimator.
Based on the following trip details, estimate the total budget required.
Trip Destinations: ${tripProfile.destinations.join(', ')}
Dates: ${tripProfile.startDate} to ${tripProfile.endDate}
Participants: ${tripProfile.participants.length}
Travel Style: ${style} (budget = backpacker/cheap, standard = mid-range/comfortable, luxury = high-end)
Currency to use: ${tripProfile.currency || 'USD'}

Here is the planned itinerary:
${JSON.stringify(days.map(d => ({ date: d.date, activities: d.items?.map((i: any) => i.text) })), null, 2)}

Provide a realistic budget estimate broken down by categories. 
Return ONLY valid JSON in this exact schema:
{
  "total": 5000,
  "currency": "USD",
  "categories": {
    "flights": 1200,
    "accommodation": 1500,
    "food": 800,
    "transportation": 300,
    "attractions": 800,
    "other": 400
  },
  "reasoning": "A short paragraph explaining the calculation."
}`;

      const system = "You are a strict JSON API. Return ONLY valid JSON matching the schema.";
      const res = await callAI([{ role: 'user', text: prompt }], getProviderForTask('chat'), { systemInstruction: system });
      const parsed = parseAIJson<BudgetEstimate | null>(res, null);
      
      if (parsed && parsed.total) {
        setEstimate(parsed);
      } else {
        throw new Error("Invalid format returned by AI.");
      }
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'שגיאה ביצירת הערכת תקציב. אנא נסה שוב.' });
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-slide-up flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Wand2 className="text-brand-500" /> הערכת תקציב חכמה
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {!estimate ? (
            <div className="space-y-6">
              <p className="text-slate-600 dark:text-slate-300">
                מטה הקסם יכול לנתח את יעד הטיול, משך הזמן, כמות המשתתפים ואת המסלול שתכננת כדי לספק הערכת תקציב ריאלית למסע שלך.
              </p>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  סגנון טיול
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'budget', label: 'חסכוני', icon: <Wallet size={16} /> },
                    { id: 'standard', label: 'רגיל / נוח', icon: <DollarSign size={16} /> },
                    { id: 'luxury', label: 'יוקרתי', icon: <Wand2 size={16} /> }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setStyle(opt.id as any)}
                      className={`flex-1 flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-xl border-2 transition-all ${style === opt.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      {opt.icon}
                      <span className="font-medium text-sm">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleEstimate}
                disabled={isEstimating || !isOnline}
                className="btn-primary w-full py-3 flex justify-center items-center gap-2 bg-gradient-to-r from-brand-600 to-indigo-600"
              >
                {isEstimating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {isEstimating ? 'מעריך תקציב...' : 'הערך עכשיו'}
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center p-6 bg-brand-50 dark:bg-brand-900/20 rounded-2xl border border-brand-100 dark:border-brand-800">
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-400 mb-1">סך הכל מוערך</p>
                <div className="text-4xl font-black text-slate-900 dark:text-white">
                  {estimate.total.toLocaleString()} <span className="text-xl text-slate-500">{estimate.currency}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-slate-800 dark:text-white">חלוקה מוערכת</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Ticket size={16} className="text-blue-500" /> טיסות
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{estimate.categories.flights.toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <MapPin size={16} className="text-indigo-500" /> מלונות
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{estimate.categories.accommodation.toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Coffee size={16} className="text-orange-500" /> אוכל
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{estimate.categories.food.toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Car size={16} className="text-teal-500" /> תחבורה
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{estimate.categories.transportation.toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Wand2 size={16} className="text-purple-500" /> אטרקציות
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{estimate.categories.attractions.toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Wallet size={16} className="text-slate-500" /> אחר
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{estimate.categories.other.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-xl text-sm leading-relaxed border border-blue-100 dark:border-blue-800/50">
                <span className="font-bold block mb-1">הסבר להערכה:</span>
                {estimate.reasoning}
              </div>

              <button
                onClick={onClose}
                className="btn-secondary w-full py-3"
              >
                סגור
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
