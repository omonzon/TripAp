import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Send, Loader2, Trash2, Brain, Menu, Plus, Pencil, Check, X, MessageSquare, Lock, Users
} from 'lucide-react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAIStore, type ChatSession } from '@/store/useAIStore';
import { useTripStore } from '@/store/useTripStore';
import { callAI, type AIMessage } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';

function ChatMessageRenderer({ text, onApplyEdit }: { text: string; onApplyEdit: (editObj: any) => void }) {
  const { t } = useTranslation();
  
  // Look for [EDIT_ITINERARY: { ... }]
  const editMatch = text.match(/\[EDIT_ITINERARY:\s*(\{.*?\})\s*\]/is);
  let displayText = text;
  let editObj: any = null;

  if (editMatch) {
    displayText = text.replace(editMatch[0], '');
    try {
      editObj = JSON.parse(editMatch[1]);
    } catch (e) {
      console.error("Failed to parse EDIT_ITINERARY JSON", e);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-sm leading-relaxed whitespace-pre-wrap ai-chat-content min-w-0 break-words"
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        dir="auto"
      >
        {displayText}
      </div>
      {editObj && (
        <div className="mt-2 flex">
          <button 
            onClick={() => onApplyEdit(editObj)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-100 hover:bg-brand-200 dark:bg-brand-900/40 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 rounded-lg text-xs font-medium transition-colors"
          >
            <Sparkles size={14} />
            ✨ {t('ai.applyEdit', 'החל עריכה על המסלול')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AIAssistantView() {
  const { t, i18n } = useTranslation();
  const { 
    getProviderForTask, getUnifiedContext, tripGraph,
    privateChatSessions, createPrivateSession, deletePrivateSession, 
    updatePrivateSessionTitle, addMessageToPrivateSession
  } = useAIStore();
  const { currentTripId, isOnline } = useTripStore();

  const [sharedChatSessions, setSharedChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'private' | 'shared'>('all');

  // Load Private Chats
  const tripPrivateSessions = Object.values(privateChatSessions).filter(s => s.tripId === currentTripId);
  
  // Sync Shared Chats with Firestore
  useEffect(() => {
    if (!currentTripId) return;
    const chatsRef = collection(db, 'trips', currentTripId, 'aiChats');
    const unsub = onSnapshot(chatsRef, (snap) => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data(), isPrivate: false } as ChatSession));
      setSharedChatSessions(loaded);
    });
    return () => unsub();
  }, [currentTripId]);

  // Combine and sort
  const allSessions = [...tripPrivateSessions, ...sharedChatSessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const displayedSessions = allSessions.filter(s => filterMode === 'all' || (filterMode === 'private' && s.isPrivate) || (filterMode === 'shared' && !s.isPrivate));

  const activeSession = allSessions.find(s => s.id === activeSessionId) || null;
  const messages = activeSession?.messages || [];

  // Auto-select first if none active
  useEffect(() => {
    if (currentTripId && displayedSessions.length > 0) {
      if (!activeSessionId || !displayedSessions.some(s => s.id === activeSessionId)) {
        setActiveSessionId(displayedSessions[0].id);
      }
    }
  }, [displayedSessions.length, activeSessionId, currentTripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isTyping]);

  const handleNewChat = async (isPrivate: boolean) => {
    if (!currentTripId) return;
    const title = t('ai.newChat') || 'New Chat';
    if (isPrivate) {
      const id = createPrivateSession(currentTripId, title);
      setActiveSessionId(id);
    } else {
      const newId = `shared-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const session: ChatSession = { id: newId, tripId: currentTripId, title, messages: [], updatedAt: Date.now(), isPrivate: false };
      await setDoc(doc(db, 'trips', currentTripId, 'aiChats', newId), session);
      setActiveSessionId(newId);
    }
    setIsSidebarOpen(false);
  };

  const handleDeleteChat = async (id: string, isPrivate: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (isPrivate) {
        deletePrivateSession(id);
      } else {
        if (!currentTripId) return;
        await deleteDoc(doc(db, 'trips', currentTripId, 'aiChats', id));
      }
      if (activeSessionId === id) setActiveSessionId(null);
      showToast({ type: 'success', message: 'Chat deleted' });
    } catch (err: any) {
      console.error('Delete chat error:', err);
      showToast({ type: 'error', message: err.message || 'Failed to delete chat' });
    }
  };

  const startEditing = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(s.id);
    setEditTitle(s.title);
  };

  const saveEdit = async (id: string, isPrivate: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      if (isPrivate) {
        updatePrivateSessionTitle(id, editTitle.trim());
      } else {
        if (currentTripId) {
          await updateDoc(doc(db, 'trips', currentTripId, 'aiChats', id), { title: editTitle.trim(), updatedAt: Date.now() });
        }
      }
    }
    setEditingChatId(null);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let targetSession = activeSession;
    let targetSessionId = activeSessionId;

    if (!targetSessionId || !targetSession) {
      if (!currentTripId) return;
      const title = input.slice(0, 30) + (input.length > 30 ? '...' : '');
      targetSessionId = createPrivateSession(currentTripId, title);
      setActiveSessionId(targetSessionId);
      targetSession = { id: targetSessionId, tripId: currentTripId, title, messages: [], updatedAt: Date.now(), isPrivate: true };
    }
    
    const userMsg: AIMessage = { role: 'user', text: input };
    
    if (targetSession.isPrivate) {
      addMessageToPrivateSession(targetSessionId, userMsg);
    } else {
      const newMessages = [...targetSession.messages, userMsg];
      await updateDoc(doc(db, 'trips', currentTripId!, 'aiChats', targetSessionId), { messages: newMessages, updatedAt: Date.now() });
    }
    
    setInput('');
    setIsLoading(true);
    
    if (targetSession.messages.length === 0 && (targetSession.title === 'New Chat' || targetSession.title === 'New Private Chat' || targetSession.title === t('ai.newChat'))) {
      const title = userMsg.text.slice(0, 30) + (userMsg.text.length > 30 ? '...' : '');
      if (targetSession.isPrivate) {
         updatePrivateSessionTitle(targetSessionId, title);
      } else {
         updateDoc(doc(db, 'trips', currentTripId!, 'aiChats', targetSessionId), { title, updatedAt: Date.now() });
      }
    }

    try {
      const history: AIMessage[] = [...targetSession.messages, userMsg];
      const language = i18n.language === 'he' ? 'Hebrew' : 'English';
      const systemInstruction = `You are a helpful travel assistant for the trip. 
${getUnifiedContext()}
Answer questions based on the trip context. Keep responses concise and formatted in markdown.
If you are suggesting or creating an actionable task for the user, include the exact syntax "[TASK: task description]" in your response. The system will automatically parse this and create a task.
If you are suggesting adding an item to the user's itinerary, use exactly this JSON format at the end of your message:
[EDIT_ITINERARY: {"date": "YYYY-MM-DD", "type": "map|food|hotel|flight", "time": "HH:MM", "text": "Activity description"}]
Ensure 'date' matches one of the trip dates.
Reply in the following language: ${language}`;

      const reply = await callAI(history, getProviderForTask('chat'), { systemInstruction, maxRetries: 1 });
      
      // Auto-extract and create tasks
      const taskMatches = reply.match(/\[TASK:\s*(.+?)\]/gi);
      if (taskMatches && currentTripId && !targetSession.isPrivate) {
        for (const match of taskMatches) {
          const taskDesc = match.replace(/\[TASK:\s*/i, '').replace(/\]$/, '').trim();
          if (taskDesc) {
            const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            try {
              await setDoc(doc(db, 'trips', currentTripId, 'tasks', taskId), {
                 id: taskId,
                 title: taskDesc,
                 status: 'pending',
                 createdAt: Date.now()
              });
              showToast({ type: 'success', message: `Task auto-created: ${taskDesc}` });
            } catch (e) {
              console.error("Failed to auto-create task:", e);
            }
          }
        }
      }
      
      if (targetSession.isPrivate) {
        addMessageToPrivateSession(targetSessionId, { role: 'assistant', text: reply });
      } else {
        const updatedNewMessages = [...history, { role: 'assistant', text: reply }];
        await updateDoc(doc(db, 'trips', currentTripId!, 'aiChats', targetSessionId), { messages: updatedNewMessages, updatedAt: Date.now() });
      }
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes('GeminiOverloadError')) {
        showToast({ type: 'warning', message: t('ai.overloadError', 'The AI service is currently overloaded. Please try again in a moment.'), duration: 5000 });
        setInput(userMsg.text);
        
        // Remove the user message we just added
        if (targetSession.isPrivate) {
           useAIStore.setState((s) => {
             const sess = s.privateChatSessions[targetSessionId];
             if (!sess) return s;
             return {
               privateChatSessions: {
                 ...s.privateChatSessions,
                 [targetSessionId]: { ...sess, messages: sess.messages.slice(0, -1) }
               }
             };
           });
        } else {
           if (currentTripId) {
             const restoredMessages = targetSession.messages; // the original before adding userMsg
             await updateDoc(doc(db, 'trips', currentTripId, 'aiChats', targetSessionId), { messages: restoredMessages, updatedAt: Date.now() }).catch(console.error);
           }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyEdit = async (editObj: any) => {
    if (!currentTripId) return;
    try {
      // Find the day with the given isoDate
      const q = query(collection(db, 'trips', currentTripId, 'itinerary'), where('isoDate', '==', editObj.date));
      const { getDocs } = await import('firebase/firestore');
      const snap = await getDocs(q);
      
      if (snap.empty) {
        showToast({ type: 'error', message: `לא נמצא יום בתאריך ${editObj.date}` });
        return;
      }
      
      const dayDoc = snap.docs[0];
      const items: any[] = dayDoc.data().items || [];
      const newItem = {
        id: `ai_item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: editObj.type || 'map',
        text: editObj.text,
        time: editObj.time || '12:00',
        completed: false,
      };
      
      const newItems = [...items, newItem];
      newItems.sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'));
      
      await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayDoc.id), { items: newItems });
      showToast({ type: 'success', message: 'הפריט התווסף בהצלחה למסלול הטיול!' });
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'אירעה שגיאה בעדכון המסלול.' });
    }
  };

  const quickPrompts = [
    'מה אני יכול לעשות מחר?',
    'תמליץ על מסעדות כשרות',
    'כמה זמן צריך בין טיסות?',
    'מה מזג האוויר צפוי?',
  ];

  return (
    <div className="flex h-[calc(100vh-12rem)] md:h-[calc(100vh-8rem)] max-w-6xl mx-auto animate-fade-in relative">
      
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Sidebar (Conversations List) */}
      <div className={`
        fixed inset-y-0 start-0 z-50 w-72 bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800 
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:h-full md:z-0 md:rounded-s-3xl
        ${isSidebarOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full md:ltr:translate-x-0 md:rtl:translate-x-0'}
        flex flex-col shadow-2xl md:shadow-none
      `}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <button 
              onClick={() => handleNewChat(true)}
              className="flex-1 flex justify-center items-center gap-1 py-2 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm transition-colors border border-slate-200 dark:border-slate-700"
            >
              <Lock size={14} /> Private
            </button>
            <button 
              onClick={() => handleNewChat(false)}
              className="flex-1 flex justify-center items-center gap-1 py-2 px-2 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 dark:hover:bg-brand-900/50 text-brand-700 dark:text-brand-300 rounded-lg text-sm transition-colors border border-brand-200 dark:border-brand-800"
            >
              <Users size={14} /> Shared
            </button>
            <button 
              className="md:hidden p-2 text-slate-500 ms-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs font-medium">
            <button onClick={() => setFilterMode('all')} className={`flex-1 py-1.5 rounded-md ${filterMode === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>All</button>
            <button onClick={() => setFilterMode('private')} className={`flex-1 py-1.5 rounded-md ${filterMode === 'private' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>Private</button>
            <button onClick={() => setFilterMode('shared')} className={`flex-1 py-1.5 rounded-md ${filterMode === 'shared' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>Shared</button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {displayedSessions.length === 0 && (
             <div className="p-4 text-center text-sm text-slate-400">
                No chats found
             </div>
          )}
          {displayedSessions.map(s => (
            <div 
              key={s.id}
              onClick={() => { setActiveSessionId(s.id); setIsSidebarOpen(false); }}
              className={`
                group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors
                ${s.id === activeSessionId ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}
              `}
            >
              {editingChatId === s.id ? (
                <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-brand-300 rounded px-2 py-1 text-sm outline-none"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(s.id, s.isPrivate || false, e as any); }}
                  />
                  <button onClick={(e) => saveEdit(s.id, s.isPrivate || false, e)} className="text-green-500 hover:text-green-600"><Check size={16} /></button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {s.isPrivate ? <Lock size={14} className="shrink-0 opacity-50" /> : <Users size={14} className="shrink-0 opacity-50 text-brand-500" />}
                    <span className="truncate text-sm font-medium">{s.title}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => startEditing(s, e)} className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg hover:bg-white dark:hover:bg-slate-950"><Pencil size={14} /></button>
                    <button onClick={(e) => handleDeleteChat(s.id, s.isPrivate || false, e)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white dark:hover:bg-slate-950"><Trash2 size={14} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-slate-50/50 dark:bg-slate-950/20 md:rounded-e-3xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              className="md:hidden p-1.5 -ms-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
              {activeSession?.isPrivate ? <Lock className="text-slate-400 shrink-0" size={18} /> : <Users className="text-brand-500 shrink-0" size={18} />}
              <span className="truncate">{activeSession?.title || t('ai.title')}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tripGraph && tripGraph.nodes.length > 0 && (
              <span className="badge bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs hidden sm:flex items-center gap-1">
                <Brain size={10} /> {t('ai.contextLoaded')} ({tripGraph.nodes.length})
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={(e) => {
                   if (activeSessionId && activeSession) handleDeleteChat(activeSessionId, activeSession.isPrivate || false, e as any);
                }}
                className="btn-ghost flex items-center gap-1 text-xs text-slate-400"
                title={t('ai.clearChat')}
              >
                <Trash2 size={13} /> <span className="hidden sm:inline">{t('ai.clearChat')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 px-4 pb-2 mt-4">
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
                    className="text-xs bg-white dark:bg-slate-800 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-xl border border-brand-200 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-900/50 transition-colors shadow-sm"
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
                <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 shadow-sm min-w-0 ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                }`}>
                  <ChatMessageRenderer text={msg.text} onApplyEdit={handleApplyEdit} />
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
        <form onSubmit={send} className="px-4 pb-4 flex gap-2 pt-2">
          <div className="flex flex-1 min-w-0 gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 items-center shadow-sm">
            <input
              id="ai-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={!isOnline ? t('app.offline') : t('ai.placeholder')}
              className="flex-1 py-3 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none disabled:opacity-50"
              dir="auto"
              disabled={isLoading || !isOnline}
            />
            <DictationButton onResult={t2 => setInput(p => p + (p ? ' ' : '') + t2)} />
          </div>
          <button
            type="submit"
            id="btn-ai-send"
            disabled={!input.trim() || isLoading || !isOnline}
            className="btn-primary w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 p-0 shadow-md disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
