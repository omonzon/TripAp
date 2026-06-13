import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, ChevronRight, X, MapPin, Coffee, Utensils, Hotel, Car, Wand2 } from 'lucide-react';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import {
  WizardStage,
  WizardAnswers,
  generateFinalItinerary
} from '@/engine/itineraryWizardEngine';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { showToast } from '@/components/ui/Toast';
import { useDraggable } from '@/hooks/useDraggable';

const STAGES: { id: WizardStage; icon: React.ReactNode }[] = [
  { id: 'origin', icon: <MapPin size={20} /> },
  { id: 'regions', icon: <MapPin size={20} /> },
  { id: 'sites', icon: <Coffee size={20} /> },
  { id: 'food', icon: <Utensils size={20} /> },
  { id: 'hotels', icon: <Hotel size={20} /> },
  { id: 'transport', icon: <Car size={20} /> },
];

export default function ItineraryWizard({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { currentTripId, tripProfile, setDays, isOnline } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({
    origin: '', regions: '', sites: '', food: '', hotels: '', transport: ''
  });
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [generatedDaysCount, setGeneratedDaysCount] = useState(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const categoriesContainerRef = useRef<HTMLDivElement>(null);
  const position = useDraggable(handleRef, modalRef);

  const currentStage = STAGES[currentStageIdx];

  useEffect(() => {
    if (categoriesContainerRef.current) {
      const activeBtn = categoriesContainerRef.current.children[currentStageIdx] as HTMLElement;
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentStageIdx]);

  const handleBack = () => {
    if (currentStageIdx > 0) setCurrentStageIdx(prev => prev - 1);
  };

  const handleNext = async () => {
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
          setGeneratedDaysCount(days.length);
          setIsSuccess(true);
        } else {
          showToast({ type: 'error', message: 'Failed to generate itinerary. Please try again.' });
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err) || '';
        if (errorMsg.includes('403') || err?.status === 403) {
          showToast({ type: 'error', message: t('settings.apiKeyInvalid', 'API Key error (403). Please check your Gemini API key in Settings.') });
        } else if (errorMsg.includes('429') || errorMsg.includes('Quota') || errorMsg.includes('quota')) {
          const retryMatch = errorMsg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
          if (retryMatch) {
            const secs = Math.ceil(parseFloat(retryMatch[1]));
            showToast({ type: 'warning', message: t('app.rateLimitRetry', `מגבלת בקשות למודל זה. אנא המתן ${secs} שניות ונסה שוב.`) });
          } else {
            showToast({ type: 'error', message: t('app.quotaExceeded', 'מכסת השימוש ב-API חרגה. אנא בדוק את המפתח או החלף מודל בהגדרות.') });
          }
        } else {
          showToast({ type: 'error', message: t('app.error', 'An error occurred during generation.') });
        }
      } finally {
        setIsGeneratingFinal(false);
      }
    }
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 bg-slate-900/50 backdrop-blur-sm animate-fade-in overflow-y-auto" dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
        <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col transition-transform duration-75 ease-out animate-scale-up">
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-brand-100 dark:bg-brand-900/50 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-10 h-10 text-brand-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
                {t('wizard.successTitle', 'הקסם הושלם! 🧙‍♂️')}
              </h2>
              <p className="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed font-medium">
                {t('wizard.successText1', `תפרנו לך מסלול של ${generatedDaysCount} ימים, מלא בחוויות, מקומות שווים, והרבה כיף.`)}
              </p>
              <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50 text-indigo-800 dark:text-indigo-300 text-sm">
                <span className="font-bold flex items-center justify-center gap-1.5 mb-2 text-indigo-900 dark:text-indigo-200">
                  <Wand2 size={16} /> {t('wizard.successTipTitle', 'טיפ של אלופים:')}
                </span>
                {t('wizard.successText2', 'כדי להפוך את הטיול למושלם, השתמש בלחצן "מטה הקסם" (AI) שנמצא ליד כל פריט במסלול. ה-AI שלנו ימצא עבורך את המלונות, המסעדות, והאטרקציות המדויקות ביותר ויחסוך לך שעות של חיפושים!')}
              </div>
            </div>
            <button 
              onClick={onClose}
              className="btn-primary w-full py-3 text-lg mt-4 shadow-lg shadow-brand-500/20"
            >
              {t('wizard.letsGo', 'יאללה, בואו נתחיל!')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 bg-slate-900/50 backdrop-blur-sm animate-fade-in overflow-y-auto" dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
      <div 
        ref={modalRef}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh] sm:h-[600px] transition-transform duration-75 ease-out"
      >
        {/* Header */}
        <div ref={handleRef} className="bg-brand-600 dark:bg-slate-900 p-4 text-white flex justify-between items-center shrink-0 cursor-move active:cursor-grabbing select-none">
          <div className="flex items-center gap-2">
            <Sparkles className="text-yellow-300" />
            <h2 className="font-bold text-lg">{t('wizard.title')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Progress */}
        <div ref={categoriesContainerRef} className="bg-slate-50 dark:bg-slate-900 px-6 py-4 flex gap-2 overflow-x-auto scroll-smooth border-b dark:border-slate-700 shrink-0 hide-scrollbar">
          {STAGES.map((s, idx) => (
            <button 
              key={s.id} 
              onClick={() => setCurrentStageIdx(idx)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${idx === currentStageIdx ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 ring-1 ring-brand-500' : idx < currentStageIdx ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
            >
              {s.icon}
              <span className="hidden sm:inline">{t(`wizard.stages.${s.id}`)}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              {currentStage.icon} {t(`wizard.stages.${currentStage.id}`)}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{t('wizard.subtitle')}</p>
          </div>

          <div className="pt-4 dark:border-slate-700">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('wizard.manualInput')}</label>
            <textarea
              value={answers[currentStage.id]}
              onChange={e => setAnswers(prev => ({ ...prev, [currentStage.id]: e.target.value }))}
              placeholder={t('wizard.manualPlaceholder')}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:outline-brand-500 focus:ring-2 focus:ring-brand-500 dark:text-white min-h-[150px]"
              rows={5}
            />
          </div>
        </div>

        <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center shrink-0">
          <div className="flex gap-2">
            <button onClick={handleBack} disabled={currentStageIdx === 0 || isGeneratingFinal} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
              {t('wizard.back')}
            </button>
            <button onClick={handleNext} disabled={isGeneratingFinal || !isOnline} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
              {t('wizard.skip')}
            </button>
          </div>
          
          <button 
            onClick={handleNext}
            disabled={isGeneratingFinal || !isOnline}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {!isOnline ? t('app.offline') : (isGeneratingFinal ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> {t('wizard.building')}</>
            ) : (
              <>{currentStageIdx === STAGES.length - 1 ? t('wizard.build') : t('wizard.next')} <ChevronRight size={16} /></>
            ))}
          </button>
        </div>
      </div>
    </div>
  );
}
