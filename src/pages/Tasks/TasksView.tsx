import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy,
} from 'firebase/firestore';
import {
  CheckSquare, Square, Trash2, Plus, Loader2, Bell,
} from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { DictationButton } from '@/components/features/DictationButton';
import { showToast } from '@/components/ui/Toast';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  category: string;
  priority: 'low' | 'medium' | 'high';
  authorEmail: string;
  createdAt: number;
  reminderDate?: string;
}

const PRIORITIES = { low: { label: 'נמוך', color: 'text-slate-400 bg-slate-100 dark:bg-slate-700' }, medium: { label: 'בינוני', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' }, high: { label: 'גבוה', color: 'text-red-600 bg-red-50 dark:bg-red-900/30' } };

export default function TasksView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { currentTripId } = useTripStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [category, setCategory] = useState('כללי');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const canWrite = appUser?.role === 'admin' || appUser?.role === 'editor';

  useEffect(() => {
    if (!currentTripId) return;
    const q = query(collection(db, 'trips', currentTripId, 'tasks'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim() || !currentTripId || !appUser) return;
    await addDoc(collection(db, 'trips', currentTripId, 'tasks'), {
      text: newTask, completed: false, category, priority,
      authorEmail: appUser.email, createdAt: Date.now(),
    });
    setNewTask('');
    showToast({ type: 'success', message: 'Task added!' });
  };

  const toggle = async (task: Task) => {
    if (!currentTripId) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'tasks', task.id), { completed: !task.completed });
  };

  const filtered = tasks.filter(t => filter === 'all' || (filter === 'pending' && !t.completed) || (filter === 'done' && t.completed));
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
              <DictationButton onResult={t2 => setNewTask(p => p + (p ? ' ' : '') + t2)} />
            </div>
            <button type="submit" id="btn-add-task" disabled={!newTask.trim()} className="btn-primary flex items-center gap-1 text-sm py-2.5">
              <Plus size={16} />
            </button>
          </form>
          <div className="flex gap-2 flex-wrap">
            {(['low', 'medium', 'high'] as Task['priority'][]).map(p => (
              <button key={p} onClick={() => setPriority(p)} className={`badge border-2 cursor-pointer transition-all ${priority === p ? 'border-brand-500' : 'border-transparent'} ${PRIORITIES[p].color}`}>
                {PRIORITIES[p].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {(['all', 'pending', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${filter === f ? 'bg-white dark:bg-slate-700 shadow-sm text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
            {f === 'all' ? 'הכל' : f === 'pending' ? t('tasks.pending') : t('tasks.completed')}
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
              <p className={`flex-1 text-sm text-slate-800 dark:text-white ${task.completed ? 'line-through text-slate-400' : ''}`} dir="auto">{task.text}</p>
              <span className={`badge text-[10px] ${PRIORITIES[task.priority]?.color}`}>{PRIORITIES[task.priority]?.label}</span>
              {canWrite && (
                <button onClick={async () => { if (currentTripId) await deleteDoc(doc(db, 'trips', currentTripId, 'tasks', task.id)); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-all">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
