import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Languages, Camera, Volume2, VolumeX, ArrowLeftRight,
  Loader2, Sparkles, Utensils,
} from 'lucide-react';
import { useAIStore } from '@/store/useAIStore';
import { callAI, parseAIJson } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';
import { compressImageToBase64 } from '@/utils/imageCompressor';

const LANGUAGE_PAIRS = [
  { from: 'auto', to: 'he', label: '→ עברית' },
  { from: 'auto', to: 'en', label: '→ English' },
  { from: 'auto', to: 'is', label: '→ Íslenska' },
  { from: 'auto', to: 'fr', label: '→ Français' },
  { from: 'auto', to: 'de', label: '→ Deutsch' },
  { from: 'auto', to: 'ru', label: '→ Русский' },
];

interface MenuAnalysis {
  items: Array<{ name: string; description: string; vegan: boolean; glutenFree: boolean; containsPork: boolean; priceISK?: number; priceILS?: number }>;
  currency: string;
}

function speak(text: string, lang: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang;
  utt.rate = 0.9;
  window.speechSynthesis.speak(utt);
}

export default function TranslationView() {
  const { t } = useTranslation();
  const { getProviderForTask } = useAIStore();

  const [sourceText, setSourceText] = useState('');
  const [translated, setTranslated] = useState('');
  const [targetLang, setTargetLang] = useState('he');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [menuData, setMenuData] = useState<MenuAnalysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null!);

  const translate = async () => {
    if (!sourceText.trim() || isTranslating) return;
    setIsTranslating(true);
    try {
      const prompt = `Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else:\n\n${sourceText}`;
      const result = await callAI(prompt, getProviderForTask('translation'));
      setTranslated(result.trim());
    } catch {
      showToast({ type: 'error', message: t('errors.aiUnavailable') });
    } finally {
      setIsTranslating(false);
    }
  };

  const toggleSpeak = () => {
    if (isSpeaking) {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      return;
    }
    if (!translated) return;
    const langMap: Record<string, string> = { he: 'he-IL', en: 'en-US', is: 'is-IS', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL' };
    speak(translated, langMap[targetLang] ?? 'he-IL');
    setIsSpeaking(true);
    setTimeout(() => setIsSpeaking(false), translated.length * 60);
  };

  const scanMenu = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    setMenuData(null);
    try {
      const base64 = await compressImageToBase64(file);
      const prompt = `Analyze this restaurant menu image and return structured info in Hebrew. Return ONLY valid JSON:
{"currency":"ISK","items":[{"name":"Dish Name","description":"Short Hebrew description","vegan":false,"glutenFree":false,"containsPork":false,"priceISK":2490}]}`;
      const text = await callAI(prompt, getProviderForTask('vision'), {
        isJson: true, base64Image: base64, mimeType: 'image/jpeg',
      });
      const result = parseAIJson<MenuAnalysis>(text, { items: [], currency: 'ISK' });
      // Add ILS prices (assuming ISK/ILS ~0.0514 rate)
      result.items = result.items.map(item => ({
        ...item,
        priceILS: item.priceISK ? Math.round(item.priceISK * 0.0514) : undefined,
      }));
      setMenuData(result);
      setIsScanning(false);
    } catch {
      showToast({ type: 'error', message: t('errors.scanFailed') });
      setIsScanning(false);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('translate.title')}</h2>

      {/* Language selector */}
      <div className="flex flex-wrap gap-2">
        {LANGUAGE_PAIRS.map(({ to, label }) => (
          <button
            key={to}
            onClick={() => setTargetLang(to)}
            className={`badge border-2 cursor-pointer text-sm py-1 px-3 transition-all ${
              targetLang === to
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Translation panels */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Source */}
        <div className="card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">מקור</span>
            <DictationButton onResult={t2 => setSourceText(p => p + (p ? ' ' : '') + t2)} />
          </div>
          <textarea
            id="translate-source"
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            placeholder={t('translate.textHere')}
            className="input-base h-32 resize-none"
            dir="auto"
          />
          <button
            id="btn-translate"
            onClick={translate}
            disabled={!sourceText.trim() || isTranslating}
            className="btn-primary flex items-center gap-2 justify-center mt-1"
          >
            {isTranslating
              ? <><Loader2 size={16} className="animate-spin" /> מתרגם...</>
              : <><Languages size={16} /> תרגם</>
            }
          </button>
        </div>

        {/* Translation */}
        <div className="card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">תרגום</span>
            <button
              id="btn-speak"
              onClick={toggleSpeak}
              disabled={!translated}
              className={`p-1.5 rounded-lg transition-all ${isSpeaking ? 'text-red-500 bg-red-50 dark:bg-red-900/30' : 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30'}`}
            >
              {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
          <div
            id="translate-result"
            className="flex-1 min-h-32 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap"
            dir={targetLang === 'he' ? 'rtl' : 'ltr'}
          >
            {translated || <span className="text-slate-400">{t('translate.translationHere')}</span>}
          </div>
        </div>
      </div>

      {/* Menu scanner */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Utensils size={18} className="text-brand-500" />
            {t('translate.menuAnalyzer')}
          </h3>
          <button
            id="btn-scan-menu"
            onClick={() => fileRef.current.click()}
            disabled={isScanning}
            className="btn-primary flex items-center gap-2 text-sm py-2"
          >
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {t('translate.scanMenu')}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={scanMenu} />
        </div>

        {isScanning && (
          <div className="flex items-center gap-3 text-sm text-brand-600 dark:text-brand-400">
            <Sparkles size={16} className="animate-pulse" />
            מנתח את התפריט עם AI...
          </div>
        )}

        {menuData && menuData.items.length > 0 && (
          <div className="space-y-3">
            {menuData.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{item.name}</span>
                    <div className="flex gap-1">
                      {item.vegan && <span className="badge bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">🌿 טבעוני</span>}
                      {item.glutenFree && <span className="badge bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">🌾 ללא גלוטן</span>}
                      {item.containsPork && <span className="badge bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">🐷 חזיר</span>}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">{item.description}</p>
                </div>
                <div className="text-right shrink-0">
                  {item.priceISK && <p className="font-bold text-sm text-slate-900 dark:text-white">{item.priceISK.toLocaleString()} ISK</p>}
                  {item.priceILS && <p className="text-xs text-slate-400">≈ {item.priceILS} ₪</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {!menuData && !isScanning && (
          <p className="text-sm text-slate-400 text-center py-4">📷 צלם תפריט מסעדה לניתוח מיידי עם AI</p>
        )}
      </div>
    </div>
  );
}
