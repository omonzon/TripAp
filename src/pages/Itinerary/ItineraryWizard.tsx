import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, ChevronRight, X, MapPin, Coffee, Utensils, Hotel, Car } from 'lucide-react';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import {
  WizardStage,
  WizardAnswers,
  suggestWizardOptions,
  generateFinalItinerary
} from '@/engine/itineraryWizardEngine';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { showToast } from '@/components/ui/Toast';

const STAGES: { id: WizardStage; title: string; icon: React.ReactNode }[] = [
  { id: 'origin', title: 'Start Location', icon: <MapPin size={20} /> },
  { id: 'regions', title: 'Regions & Cities', icon: <MapPin size={20} /> },
  { id: 'sites', title: 'Attractions', icon: <Coffee size={20} /> },
  { id: 'food', title: 'Food & Restaurants', icon: <Utensils size={20} /> },
  { id: 'hotels', title: 'Accommodation', icon: <Hotel size={20} /> },
  { id: 'transport', title: 'Transportation', icon: <Car size={20} /> },
];

export default function ItineraryWizard({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { currentTripId, tripProfile, setDays } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({
    origin: '', regions: '', sites: '', food: '', hotels: '', transport: ''
  });
  
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const currentStage = STAGES[currentStageIdx];

  useEffect(() => {
    if (!tripProfile) return;
    let isMounted = true;
    
    const loadSuggestions = async () => {
      setIsLoadingSuggestions(true);
      setSuggestions([]);
      const opts = await suggestWizardOptions(
        currentStage.id, 
        tripProfile, 
        answers, 
        getProviderForTask('itinerary'), 
        i18n.language
      );
      if (isMounted) {
        setSuggestions(opts);
        setIsLoadingSuggestions(false);
      }
    };
    
    loadSuggestions();
    
    return () => { isMounted = false; };
  }, [currentStageIdx, tripProfile, i18n.language]);

  const handleSelect = (choice: string) => {
    setAnswers(prev => ({ ...prev, [currentStage.id]: prev[currentStage.id] ? prev[currentStage.id] + ', ' + choice : choice }));
  };

  const handleNext = async () => {
    if (manualInput.trim()) {
      handleSelect(manualInput);
      setManualInput('');
    }

    if (currentStageIdx < STAGES.length - 1) {
      setCurrentStageIdx(prev => prev + 1);
    } else {
      // Final stage - generate itinerary
      if (!currentTripId || !tripProfile) return;
      setIsGeneratingFinal(true);
      try {
        const days = await generateFinalItinerary(
          tripProfile, 
          answers, 
          getProviderForTask('itinerary'), 
          i18n.language
        );
        
        if (days && days.length > 0) {
          const batch = writeBatch(db);
          days.forEach(day => {
            const dayRef = doc(collection(db, 'trips', currentTripId, 'itinerary'));
            day.docId = dayRef.id;
            batch.set(dayRef, day);
          });
          await batch.commit();
          setDays(days); // Update store locally for immediate feedback
          showToast({ type: 'success', message: 'Itinerary generated successfully!' });
          onClose();
        } else {
          showToast({ type: 'error', message: 'Failed to generate itinerary. Please try again.' });
        }
      } catch (err) {
        showToast({ type: 'error', message: 'An error occurred during generation.' });
      } finally {
        setIsGeneratingFinal(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in" dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh] sm:h-[600px]">
        {/* Header */}
        <div className="bg-brand-600 dark:bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="text-yellow-300" />
            <h2 className="font-bold text-lg">AI Trip Builder</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Progress */}
        <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 flex gap-2 overflow-x-auto border-b dark:border-slate-700 shrink-0 hide-scrollbar">
          {STAGES.map((s, idx) => (
            <div key={s.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${idx === currentStageIdx ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 ring-1 ring-brand-500' : idx < currentStageIdx ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
              {s.icon}
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              {currentStage.icon} {currentStage.title}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Select suggestions from AI or enter your own preferences.</p>
          </div>

          <div className="space-y-3">
            {isLoadingSuggestions ? (
              <div className="flex flex-col items-center justify-center p-8 space-y-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                <p className="text-sm animate-pulse">AI is thinking...</p>
              </div>
            ) : (
              suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(s)}
                  className={`w-full text-start p-4 rounded-xl border-2 transition-all ${answers[currentStage.id].includes(s) ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'}`}
                >
                  <p className="text-sm text-slate-700 dark:text-slate-300">{s}</p>
                </button>
              ))
            )}
          </div>

          <div className="pt-4 border-t dark:border-slate-700">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Or add your own preference:</label>
            <textarea
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="E.g. I want to start in Tokyo and travel by Shinkansen..."
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:outline-brand-500 focus:ring-2 focus:ring-brand-500 dark:text-white"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center shrink-0">
          <button onClick={handleNext} disabled={isGeneratingFinal} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm font-medium px-4 py-2">
            Skip
          </button>
          
          <button 
            onClick={handleNext}
            disabled={isGeneratingFinal}
            className="btn-primary flex items-center gap-2"
          >
            {isGeneratingFinal ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Building Trip...</>
            ) : (
              <>{currentStageIdx === STAGES.length - 1 ? 'Build Itinerary' : 'Next Step'} <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
