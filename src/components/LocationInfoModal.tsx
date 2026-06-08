import React, { useState, useEffect } from 'react';
import { X, MapPin, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIStore } from '@/store/useAIStore';
import { callAI } from '@/services/ai';

interface LocationInfoModalProps {
  locationName: string;
  onClose: () => void;
}

export default function LocationInfoModal({ locationName, onClose }: LocationInfoModalProps) {
  const { t } = useTranslation();
  const { providerType, apiKey, getProviderForTask } = useAIStore();
  const [info, setInfo] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true);
      setError('');
      try {
        const provider = getProviderForTask('chat');
        if (!provider || !apiKey) {
          throw new Error('AI provider not configured');
        }

        const prompt = `Provide a brief, engaging summary about the location: "${locationName}". Include a tiny bit of history, 1-2 practical tips for travelers, and format it nicely with markdown. Make it short (max 2 paragraphs). Language: same as the user prompt or English if unclear.`;
        const system = `You are a helpful travel guide.`;

        const response = await callAI(
          [{ role: 'user', text: prompt }],
          provider,
          { systemInstruction: system }
        );
        setInfo(response);
      } catch (err) {
        console.error(err);
        setError(t('app.error', 'An error occurred'));
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [locationName, apiKey, getProviderForTask, t]);

  const searchQuery = encodeURIComponent(locationName);

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 bg-slate-900/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
            <MapPin className="text-brand-500" size={20} />
            {locationName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="animate-spin text-brand-500" size={32} />
              <p className="text-sm text-slate-500 font-medium animate-pulse flex items-center gap-2">
                <Sparkles size={14} className="text-brand-400" />
                {t('app.loading', 'Loading...')}
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-6 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <p className="text-sm font-medium">{error}</p>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
              <div dangerouslySetInnerHTML={{ __html: info.replace(/\n/g, '<br/>') }} />
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Explore More</h4>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://www.tripadvisor.com/Search?q=${searchQuery}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
              >
                TripAdvisor <ExternalLink size={12} />
              </a>
              <a
                href={`https://www.reddit.com/search/?q=${searchQuery}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200"
              >
                Reddit <ExternalLink size={12} />
              </a>
              <a
                href={`https://www.google.com/search?q=${searchQuery}+travel+tips+forum`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
              >
                Google Search <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
