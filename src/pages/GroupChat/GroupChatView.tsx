import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  onSnapshot, collection, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { Send, Loader2, MessageCircle, Edit2, Trash2, X, Check } from 'lucide-react';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
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

  const confirmDelete = async () => {
    if (!currentTripId || !messageToDelete) return;
    await deleteDoc(doc(db, 'trips', currentTripId, 'group_chat', messageToDelete));
    setMessageToDelete(null);
  };

  const handleSaveEdit = async (id: string) => {
    if (!currentTripId || !editText.trim()) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'group_chat', id), { text: editText });
    setEditingId(null);
  };

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
          messages.map(msg => {
            const me = isMe(msg.authorEmail);
            return (
              <div key={msg.id} className={`flex ${me ? 'justify-end' : 'justify-start'} group items-center gap-2 animate-fade-in`}>
                
                {/* Actions (Edit/Delete) */}
                {me && editingId !== msg.id && (
                  <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => { setEditingId(msg.id); setEditText(msg.text); }} className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand-500 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => setMessageToDelete(msg.id)} className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                <div className={`flex flex-col gap-1 w-full max-w-[75%] ${me ? 'items-end' : 'items-start'}`}>
                  {!me && msg.authorName && (
                    <span className="text-[10px] text-slate-500 mx-1 font-medium">{msg.authorName}</span>
                  )}
                  <div className={`w-full rounded-2xl px-4 py-2.5 shadow-sm relative ${
                    me
                      ? 'bg-brand-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                  }`}>
                    {editingId === msg.id ? (
                      <div className="flex items-center gap-2 mt-1">
                      <input 
                        value={editText} 
                        onChange={(e) => setEditText(e.target.value)} 
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(msg.id); }}
                        className="text-sm bg-white/20 text-white placeholder-white/50 border-none outline-none rounded px-2 py-1 flex-1"
                        autoFocus
                      />
                      <button onClick={() => handleSaveEdit(msg.id)} className="p-1 hover:bg-white/20 rounded"><Check size={14}/></button>
                      <button onClick={() => setEditingId(null)} className="p-1 hover:bg-white/20 rounded"><X size={14}/></button>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="auto">{msg.text}</p>
                    )}
                    
                    <p className={`text-[10px] mt-1 ${me ? 'text-brand-200' : 'text-slate-400'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
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

      {/* Delete Confirmation Modal */}
      {messageToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex justify-center items-start pt-20 sm:pt-24 p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMessageToDelete(null)} className="absolute top-4 end-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={20} />
            </button>
            <div className="p-6 text-center mt-2">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {t('app.confirmDelete', 'Are you sure?')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                פעולה זו תמחק את ההודעה לתמיד ולא יהיה ניתן לשחזר אותה.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setMessageToDelete(null)}
                  className="flex-1 btn-ghost"
                >
                  {t('app.cancel', 'Cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors"
                >
                  {t('app.delete', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
