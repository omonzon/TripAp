import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, collection, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { DictationButton } from '@/components/features/DictationButton';

interface ChatMessage {
  id: string;
  text: string;
  authorName: string;
  authorEmail: string;
  createdAt: number;
}

export default function GroupChatView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { currentTripId } = useTripStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentTripId) return;
    const q = query(collection(db, 'trips', currentTripId, 'group_chat'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentTripId || !appUser || sending) return;
    setSending(true);
    const msg = text;
    setText('');
    await addDoc(collection(db, 'trips', currentTripId, 'group_chat'), {
      text: msg,
      authorName: appUser.name,
      authorEmail: appUser.email,
      createdAt: Date.now(),
    });
    setSending(false);
  };

  const isMe = (email: string) => email === appUser?.email;

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-2xl mx-auto animate-fade-in">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{t('chat.title')}</h2>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <MessageCircle size={40} className="mb-3 opacity-30" />
            <p>{t('chat.noMessages')}</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${isMe(msg.authorEmail) ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                isMe(msg.authorEmail)
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm'
              }`}>
                {!isMe(msg.authorEmail) && (
                  <p className="text-xs font-bold mb-1 text-brand-600 dark:text-brand-400">{msg.authorName}</p>
                )}
                <p className="text-sm leading-relaxed" dir="auto">{msg.text}</p>
                <p className={`text-[10px] mt-1 ${isMe(msg.authorEmail) ? 'text-brand-200' : 'text-slate-400'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex flex-1 gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 items-center shadow-sm">
          <input
            id="chat-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('chat.placeholder')}
            className="flex-1 py-3 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
            dir="auto"
          />
          <DictationButton onResult={t2 => setText(p => p + (p ? ' ' : '') + t2)} />
        </div>
        <button
          type="submit"
          id="btn-send-chat"
          disabled={!text.trim() || sending}
          className="btn-primary w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 p-0"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
