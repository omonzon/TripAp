import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy,
} from 'firebase/firestore';
import {
  CheckSquare, Square, Trash2, Plus, Loader2, Bell, Sparkles, X, Lock, Users, Edit2, Check
} from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, useUserRole } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { generateTripTasks } from '@/engine/taskGenerator';
import { DictationButton } from '@/components/features/DictationButton';
import { showToast } from '@/components/ui/Toast';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  category: string;
  authorEmail: string;
  visibility?: 'private' | 'shared';
  priority?: 'low' | 'medium' | 'high';
  createdAt: number;
  reminderDate?: string;
  reminderLocation?: { lat: number; lng: number; name: string };
  reminderSent?: boolean;
}

const PRIORITIES = { low: { color: 'text-slate-400 bg-slate-100 dark:bg-slate-700' }, medium: { color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' }, high: { color: 'text-red-600 bg-red-50 dark:bg-red-900/30' } };

function AddressAutocomplete({ onSelect }: { onSelect: (lat: string, lng: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
        const data = await res.json();
        setResults(data);
        setShowDropdown(true);
      } catch {
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(delay);
  }, [query]);

  return (
    <div className="relative mt-3">
      <label className="block text-xs font-medium text-slate-500 mb-1">{t('tasks.searchLocation', 'Search Address / Location')}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
        placeholder={t('tasks.searchPlaceholder', 'e.g. Eiffel Tower')}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
      />
      {loading && <div className="absolute right-3 top-8 text-slate-400 text-xs">...</div>}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(r.display_name);
                onSelect(r.lat, r.lon);
                setShowDropdown(false);
              }}
              className="w-full text-start px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0 truncate"
              title={r.display_name}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksView() {
  const { t } = useTranslation();
  const { appUser, emailjsConfig, language } = useAuthStore();
  const { currentTripId, tripProfile } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [category, setCategory] = useState('general');
  const [visibility, setVisibility] = useState<'private' | 'shared'>('shared');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [enableLocation, setEnableLocation] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const [reminderDateStr, setReminderDateStr] = useState('');
  const [reminderLat, setReminderLat] = useState('');
  const [reminderLng, setReminderLng] = useState('');

  const userRole = useUserRole();
  const canWrite = userRole === 'admin' || userRole === 'editor';

  useEffect(() => {
    if (!currentTripId) return;
    const q = query(collection(db, 'trips', currentTripId, 'tasks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId]);

  const triggerReminder = async (task: Task) => {
    showToast({ type: 'success', message: `⏰ Reminder: ${task.text}` });
    
    // Desktop/Mobile Push Notification
    if (Notification && Notification.permission === 'granted') {
      try { new Notification('TravelPlatform Reminder', { body: task.text }); } catch (e) {}
    } else if (Notification && Notification.permission !== 'denied') {
      try {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification('TravelPlatform Reminder', { body: task.text });
        }).catch(() => {});
      } catch (e) {}
    }

    // EmailJS (if configured)
    if (emailjsConfig?.serviceId && emailjsConfig?.templateId && emailjsConfig?.publicKey) {
      try {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: emailjsConfig.serviceId,
            template_id: emailjsConfig.templateId,
            user_id: emailjsConfig.publicKey,
            template_params: {
              message: task.text,
              to_email: appUser?.email
            }
          })
        });
      } catch (err) {
        console.error('Failed to send email reminder', err);
      }
    }

    if (currentTripId && canWrite) {
      try {
        await updateDoc(doc(db, 'trips', currentTripId, 'tasks', task.id), { reminderSent: true });
      } catch (err) {
        console.error('Failed to update task reminderSent', err);
      }
    }
  };

  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      tasks.forEach(task => {
        if (!task.completed && task.reminderDate && !task.reminderSent && !triggeredRef.current.has(task.id)) {
          const reminderTime = new Date(task.reminderDate).getTime();
          if (now >= reminderTime) {
            if (task.reminderLocation) {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                  const latDiff = pos.coords.latitude - task.reminderLocation!.lat;
                  const lngDiff = pos.coords.longitude - task.reminderLocation!.lng;
                  const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
                  if (dist < 0.05) {
                    triggeredRef.current.add(task.id);
                    triggerReminder(task);
                  }
                });
              }
            } else {
              triggeredRef.current.add(task.id);
              triggerReminder(task);
            }
          }
        }
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [tasks, currentTripId]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim() || !currentTripId || !appUser) return;
    await addDoc(collection(db, 'trips', currentTripId, 'tasks'), {
      text: newTask, completed: false, category, priority,
      authorEmail: appUser.email, visibility, createdAt: Date.now(),
    });
    setNewTask('');
    showToast({ type: 'success', message: t('tasks.taskAdded') });
  };

  const handleGenerateSmartTasks = async () => {
    if (!currentTripId || !appUser || !tripProfile) return;
    setGeneratingTasks(true);
    try {
      await generateTripTasks(tripProfile, getProviderForTask('chat'), language, appUser.email);
      showToast({ type: 'success', message: t('tasks.smartTasksGenerated', 'Smart tasks generated!') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    } finally {
      setGeneratingTasks(false);
    }
  };

  const saveReminder = async () => {
    if (!reminderTask || !currentTripId) return;
    try {
      const loc = enableLocation && reminderLat && reminderLng ? { lat: parseFloat(reminderLat), lng: parseFloat(reminderLng), name: 'Location' } : null;
      await updateDoc(doc(db, 'trips', currentTripId, 'tasks', reminderTask.id), {
        reminderDate: reminderDateStr || null,
        reminderLocation: loc,
        reminderSent: false
      });
      setReminderTask(null);
      showToast({ type: 'success', message: t('tasks.reminderSaved', 'Reminder saved') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    }
  };

  const removeReminder = async () => {
    if (!reminderTask || !currentTripId) return;
    try {
      await updateDoc(doc(db, 'trips', currentTripId, 'tasks', reminderTask.id), {
        reminderDate: null,
        reminderLocation: null,
        reminderSent: false
      });
      setReminderTask(null);
      showToast({ type: 'success', message: t('tasks.reminderRemoved', 'התראה הוסרה') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    }
  };

  const toggle = async (task: Task) => {
    if (!currentTripId) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'tasks', task.id), { completed: !task.completed });
  };

  const priorityWeight = { high: 3, medium: 2, low: 1 };
  const filtered = tasks
    .filter(t => !t.visibility || t.visibility === 'shared' || t.authorEmail === appUser?.email)
    .filter(t => filter === 'all' || (filter === 'pending' && !t.completed) || (filter === 'done' && t.completed))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.priority !== b.priority) return priorityWeight[b.priority || 'medium'] - priorityWeight[a.priority || 'medium'];
      if (a.reminderDate && !b.reminderDate) return -1;
      if (!a.reminderDate && b.reminderDate) return 1;
      if (a.reminderDate && b.reminderDate) {
        return new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime();
      }
      return 0;
    });
  const pending = tasks.filter(t => !t.completed).length;
  const done = tasks.filter(t => t.completed).length;

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('tasks.title')}</h2>
        <div className="flex gap-2 text-xs font-medium">
          <span className="badge bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{pending} {t('tasks.pending')}</span>
          <span className="badge bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">{done} {t('tasks.completed')}</span>
        </div>
      </div>

      {/* Add task */}
      {canWrite && (
        <div className="card p-4 space-y-3">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('tasks.addManual', 'Add Task')}</h3>
            <button onClick={handleGenerateSmartTasks} disabled={generatingTasks} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5 transition-all">
              {generatingTasks ? <Loader2 size={12} className="animate-spin text-brand-500" /> : <Sparkles size={12} className="text-amber-500" />}
              {t('tasks.generateSmart', 'AI Smart Tasks')}
            </button>
          </div>
          <form onSubmit={addTask} className="flex gap-2">
            <div className="flex flex-1 gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 items-center">
              <input
                id="new-task-input"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder={t('tasks.placeholder')}
                className="flex-1 py-2.5 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                dir="auto"
              />
                <DictationButton onResult={setNewTask} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility(v => v === 'shared' ? 'private' : 'shared')}
                  className={`p-2 rounded-xl border flex items-center justify-center transition-colors ${
                    visibility === 'private'
                      ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'
                      : 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400'
                  }`}
                  title={visibility === 'private' ? 'Private' : 'Shared'}
                >
                  {visibility === 'private' ? <Lock size={16} /> : <Users size={16} />}
                </button>
                <button type="submit" id="btn-add-task" disabled={!newTask.trim()} className="btn-primary flex items-center gap-1 text-sm py-2.5">
                  <Plus size={16} />
                </button>
              </div>
          </form>
          <div className="flex gap-2 flex-wrap">
            {(['low', 'medium', 'high'] as const).map(p => (
              <button key={p} onClick={() => setPriority(p)} className={`badge border-2 cursor-pointer transition-all ${priority === p ? 'border-brand-500' : 'border-transparent'} ${PRIORITIES[p || 'medium'].color}`}>
                {t(`tasks.${p}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {(['all', 'pending', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${filter === f ? 'bg-white dark:bg-slate-700 shadow-sm text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
            {f === 'all' ? t('tasks.all') : f === 'pending' ? t('tasks.pending') : t('tasks.completed')}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            <CheckSquare size={32} className="mx-auto mb-2 opacity-30" />
            <p>{t('tasks.noTasks')}</p>
          </div>
        ) : (
          filtered.map(task => (
            <div key={task.id} className={`card p-3 flex items-center gap-3 group transition-all ${task.completed ? 'opacity-60' : ''}`}>
              <button onClick={() => toggle(task)} className="shrink-0 text-brand-600 dark:text-brand-400 hover:scale-110 transition-transform">
                {task.completed ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-300 dark:text-slate-600" />}
              </button>
              
              {editingTaskId === task.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    value={editTaskText}
                    onChange={e => setEditTaskText(e.target.value)}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm focus:outline-none"
                    dir="auto"
                    autoFocus
                  />
                  <button onClick={async () => {
                    if (currentTripId) await updateDoc(doc(db, 'trips', currentTripId, 'tasks', task.id), { text: editTaskText });
                    setEditingTaskId(null);
                  }} className="text-brand-500 hover:text-brand-600 p-1"><Check size={16} /></button>
                  <button onClick={() => setEditingTaskId(null)} className="text-slate-400 hover:text-slate-500 p-1"><X size={16} /></button>
                </div>
              ) : (
                <p className={`flex-1 text-sm text-slate-800 dark:text-white ${task.completed ? 'line-through text-slate-400' : ''}`} dir="auto">
                  {task.text}
                  <span className="ms-2 opacity-50">
                    {task.priority === 'high' ? '🔥' : task.priority === 'medium' ? '⭐' : '📝'}
                    {task.visibility === 'private' && <Lock size={10} className="inline ms-1 text-red-500" />}
                  </span>
                </p>
              )}
              
              <span className={`badge text-[10px] ${PRIORITIES[task.priority || 'medium']?.color}`}>{t(`tasks.${task.priority || 'medium'}`)}</span>
              {canWrite && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => {
                    setEditingTaskId(task.id);
                    setEditTaskText(task.text);
                  }} className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-slate-800 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => {
                    setReminderDateStr(task.reminderDate || '');
                    setReminderLat(task.reminderLocation?.lat.toString() || '');
                    setReminderLng(task.reminderLocation?.lng.toString() || '');
                    setEnableLocation(!!task.reminderLocation);
                    setReminderTask(task);
                  }} className={`p-1.5 rounded-lg transition-all ${task.reminderDate || task.reminderLocation ? 'opacity-100 text-amber-500 hover:text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Bell size={14} />
                  </button>
                  <button onClick={async () => { if (currentTripId) await deleteDoc(doc(db, 'trips', currentTripId, 'tasks', task.id)); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-slate-800 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {reminderTask && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
              {t('tasks.setReminder', 'Set Reminder')}
            </h3>
            <p className="text-sm text-slate-500 mb-4 truncate" dir="auto">{reminderTask.text}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('tasks.reminderTime', 'Date & Time')}</label>
                <input 
                  type="datetime-local" 
                  value={reminderDateStr}
                  onChange={(e) => setReminderDateStr(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={enableLocation} onChange={e => setEnableLocation(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  {t('tasks.enableLocation', 'הפעל התראת מיקום (Location Alert)')}
                </label>
              </div>

              {enableLocation && (
                <div className="space-y-4 pt-2">
                  <AddressAutocomplete onSelect={(lat, lng) => {
                    setReminderLat(lat);
                    setReminderLng(lng);
                  }} />

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">{t('tasks.lat', 'Latitude')}</label>
                      <input type="number" placeholder="64.14" value={reminderLat} onChange={e => setReminderLat(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">{t('tasks.lng', 'Longitude')}</label>
                      <input type="number" placeholder="-21.94" value={reminderLng} onChange={e => setReminderLng(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setReminderTask(null)} className="flex-1 btn-secondary py-2">{t('app.cancel', 'Cancel')}</button>
              {(reminderTask.reminderDate || reminderTask.reminderLocation) && (
                <button onClick={removeReminder} className="flex-1 btn-secondary py-2 !text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20">{t('tasks.removeReminder', 'הסר')}</button>
              )}
              <button onClick={saveReminder} className="flex-1 btn-primary py-2">{t('app.save', 'Save')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
