import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Send, Loader2, Trash2, Brain, MessageSquare,
} from 'lucide-react';
import { useAIStore } from '@/store/useAIStore';
import { useTripStore } from '@/store/useTripStore';
import { callAI, type AIMessage } from '@/services/ai';
import { graphToContext } from '@/engine/semanticEngine';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';

export default function AIAssistantView() {
  const { t, i18n } = useTranslation();
  const { getProviderForTask, getUnifiedContext, tripGraph } = useAIStore();
  const { tripProfile } = useTripStore();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMsg: AIMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const history: AIMessage[] = [...messages, userMsg];
      const language = i18n.language === 'he' ? 'Hebrew' : 'English';
      const systemInstruction = `You are a helpful travel assistant for the trip. 
${getUnifiedContext()}
Answer questions based on the trip context. Keep responses concise and formatted in markdown.
Reply in the following language: ${language}`;

      const reply = await callAI(history, getProviderForTask('chat'), { systemInstruction, maxRetries: 1 });
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && err.message.includes('429');
      showToast({ type: 'error', message: isRateLimit ? t('app.rateLimitError') : t('errors.aiUnavailable') });
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'מה אני יכול לעשות מחר?',
    'תמליץ על מסעדות כשרות',
    'כמה זמן צריך בין טיסות?',
    'מה מזג האוויר צפוי?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="text-brand-500" size={22} />
          {t('ai.title')}
        </h2>
        <div className="flex items-center gap-2">
          {tripGraph && tripGraph.nodes.length > 0 && (
            <span className="badge bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs flex items-center gap-1">
              <Brain size={10} /> {t('ai.contextLoaded')} ({tripGraph.nodes.length} nodes)
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="btn-ghost flex items-center gap-1 text-xs text-slate-400"
              title={t('ai.clearChat')}
            >
              <Trash2 size={13} /> {t('ai.clearChat')}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="w-16 h-16 rounded-3xl gradient-brand flex items-center justify-center shadow-lg">
              <Sparkles className="text-white" size={28} />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t('ai.title')}
              </h3>
              <p className="text-sm text-slate-400 max-w-xs">
                {t('ai.placeholder')}
              </p>
            </div>
            {/* Quick prompts */}
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-xs bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-xl border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
                  dir="rtl"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl gradient-brand flex items-center justify-center shrink-0 me-2 mt-1">
                  <Sparkles size={13} className="text-white" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm'
              }`}>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap ai-chat-content"
                  dir="auto"
                >
                  {msg.text}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-xl gradient-brand flex items-center justify-center shrink-0 me-2 mt-1">
              <Sparkles size={13} className="text-white animate-pulse" />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-5">
                <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex flex-1 gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 items-center shadow-sm">
          <input
            id="ai-chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('ai.placeholder')}
            className="flex-1 py-3 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
            dir="auto"
            disabled={isLoading}
          />
          <DictationButton onResult={t2 => setInput(p => p + (p ? ' ' : '') + t2)} />
        </div>
        <button
          type="submit"
          id="btn-ai-send"
          disabled={!input.trim() || isLoading}
          className="btn-primary w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 p-0"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
