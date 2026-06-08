import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, type ItineraryItem } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { callAI } from '@/services/ai';

interface DailyBriefingModalProps {
  todayItems: ItineraryItem[];
  tripName: string;
  onClose: () => void;
}

export default function DailyBriefingModal({ todayItems, tripName, onClose }: DailyBriefingModalProps) {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { providerType, apiKey, getProviderForTask } = useAIStore();
  const [briefing, setBriefing] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBriefing = async () => {
      setLoading(true);
      setError('');
      try {
        const provider = getProviderForTask('chat');
        if (!provider || !apiKey) {
          throw new Error('AI provider not configured');
        }

        const itemsText = todayItems.length > 0 
          ? todayItems.map(i => `- ${i.text.replace(/<[^>]*>?/gm, '')}`).join('\n')
          : 'Free day! No specific plans.';

        const prompt = `Write a short, fun, and energetic morning briefing for today's trip! 
Trip name: ${tripName}
Today's plan:
${itemsText}

Include:
1. A quick energetic summary of what we are doing today.
2. 2-3 bullet points of important reminders (e.g. bring sunscreen, water, tickets, etc.) based on the activities.
3. A strong, funny group encouragement sentence at the end!
Language: same as the user prompt or Hebrew if unclear. Keep it short (max 100 words). Use emojis!`;

        const system = `You are an energetic, fun tour guide giving a morning briefing to a group of friends/family.`;

        const response = await callAI(
          [{ role: 'user', text: prompt }],
          provider,
          { systemInstruction: system }
        );
        setBriefing(response);
      } catch (err) {
        console.error(err);
        setError(t('app.error', 'Failed to generate briefing'));
      } finally {
        setLoading(false);
      }
    };

    fetchBriefing();
  }, [todayItems, tripName, apiKey, getProviderForTask, t]);

  return (
    <div className="fixed inset-0 z-[200] flex justify-center items-start pt-20 sm:pt-24 p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-amber-300 to-orange-500 opacity-20"></div>
        
        <button
          onClick={onClose}
          className="absolute top-4 end-4 z-10 p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-full hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-6 pt-10 text-center relative z-10">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30 mb-4 animate-bounce-slight">
            <Sun className="text-white" size={32} />
          </div>
          <h2 className="font-extrabold text-2xl text-slate-800 dark:text-white mb-2">
            Good Morning! ☀️
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">
            Your daily briefing for {tripName}
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 text-start border border-slate-100 dark:border-slate-700">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-3">
                <Loader2 className="animate-spin text-orange-500" size={28} />
                <p className="text-sm text-slate-500 font-medium animate-pulse flex items-center gap-2">
                  <Sparkles size={14} className="text-orange-400" />
                  Generating your briefing...
                </p>
              </div>
            ) : error ? (
              <p className="text-sm text-red-500 text-center">{error}</p>
            ) : (
              <div 
                className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
                dangerouslySetInnerHTML={{ __html: briefing.replace(/\n/g, '<br/>') }}
              />
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95"
          >
            Let's Go! 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
