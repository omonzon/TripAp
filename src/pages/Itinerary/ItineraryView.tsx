import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, query, collection, doc,
  updateDoc, addDoc, deleteDoc, writeBatch,
  orderBy,
} from 'firebase/firestore';
import {
  Sparkles, Loader2, Map, Edit2, Trash2, GripVertical,
  Plane, RefreshCcw, Sun, Cloud, Plus, Lock,
} from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, type ItineraryDay, type ItineraryItem } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { callAI, parseAIJson } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';
import ItineraryWizard from './ItineraryWizard';

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, { color: string; emoji: string }> = {
  flight:  { color: 'text-blue-600',   emoji: '✈️' },
  hotel:   { color: 'text-purple-600', emoji: '🏨' },
  ship:    { color: 'text-cyan-600',   emoji: '🚢' },
  food:    { color: 'text-orange-500', emoji: '🍽️' },
  home:    { color: 'text-green-600',  emoji: '🏠' },
  map:     { color: 'text-indigo-600', emoji: '📍' },
  ticket:  { color: 'text-pink-600',   emoji: '🎟️' },
  car:     { color: 'text-slate-600',  emoji: '🚗' },
  train:   { color: 'text-yellow-600', emoji: '🚂' },
  note:    { color: 'text-slate-400',  emoji: '📝' },
};

// ── Weather widget ────────────────────────────────────────────────────────────
function WeatherBanner({ lat, lng, locationName }: { lat: number; lng: number; locationName: string }) {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<{ temperature: number; windspeed: number } | null>(null);

  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(r => r.json())
      .then(d => setWeather(d.current_weather))
      .catch(() => {});
  }, [lat, lng]);

  if (!weather) return null;

  return (
    <div className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-3 rounded-xl flex items-center gap-3 mb-4 shadow-sm">
      {weather.temperature > 20 ? <Sun size={24} className="text-yellow-300 shrink-0" /> : <Cloud size={24} className="shrink-0" />}
      <div>
        <p className="font-bold text-sm">{t('itinerary.currentWeather')} ({locationName})</p>
        <p className="text-xs opacity-90">{weather.temperature}°C · {weather.windspeed} km/h</p>
      </div>
    </div>
  );
}

// ── Icon Selector ─────────────────────────────────────────────────────────────
function IconSelector({ selected, onSelect }: { selected: string; onSelect: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {Object.entries(ICON_MAP).map(([type, { emoji }]) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all border-2 ${
            selected === type
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 scale-110'
              : 'border-transparent bg-slate-100 dark:bg-slate-800 hover:scale-105'
          }`}
          title={type}
          aria-label={type}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ── Flight tracker widget ─────────────────────────────────────────────────────
function FlightWidget({ item, dayDocId, days }: { item: ItineraryItem; dayDocId: string; days: ItineraryDay[] }) {
  const { t } = useTranslation();
  const { getProviderForTask } = useAIStore();
  const [refreshing, setRefreshing] = useState(false);
  const { currentTripId } = useTripStore();

  const refresh = async () => {
    if (!currentTripId) return;
    setRefreshing(true);
    try {
      const prompt = `You are a flight tracker. Predict live tracking info for this flight context. Return ONLY valid JSON: {"status":"On Time","terminal":"3","gate":"A12","checkin":"Desk 4","time":"14:00"}. Context: "${item.text}"`;
      const text = await callAI(prompt, getProviderForTask('chat'), { isJson: true });
      const parsed = parseAIJson<Record<string, string>>(text, {});
      const day = days.find(d => d.docId === dayDocId);
      if (!day) return;
      const updatedItems = day.items.map(i => i.id === item.id ? { ...i, flightData: parsed } : i);
      await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayDocId), { items: updatedItems });
    } catch {
      showToast({ type: 'error', message: 'Flight sync failed.' });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="mt-2 p-3 bg-blue-50 dark:bg-slate-900 rounded-xl border border-blue-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-blue-100 dark:border-slate-700">
        <h4 className="font-bold text-xs text-blue-800 dark:text-blue-400 flex items-center gap-1">
          <Plane size={12} /> {t('itinerary.flightTracker')}
        </h4>
        <button onClick={refresh} disabled={refreshing} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
          {refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
          {t('itinerary.sync')}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[
          { label: t('itinerary.flight.time'), val: item.flightData?.time ?? '--:--' },
          { label: t('itinerary.flight.status'), val: item.flightData?.status ?? '-', highlight: true },
          { label: t('itinerary.flight.terminalGate'), val: `${item.flightData?.terminal ? `T${item.flightData.terminal}/` : ''}${item.flightData?.gate ?? '-'}` },
          { label: t('itinerary.flight.checkin'), val: item.flightData?.checkin ?? '-' },
        ].map(({ label, val, highlight }) => (
          <div key={label} className="bg-white dark:bg-slate-800 p-2 rounded shadow-sm text-center">
            <span className="block text-slate-400 mb-1">{label}</span>
            <strong className={highlight && val.toLowerCase().includes('delay') ? 'text-red-500' : highlight ? 'text-green-500' : 'text-slate-800 dark:text-white'}>
              {val}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Itinerary View ───────────────────────────────────────────────────────
export default function ItineraryView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { currentTripId, tripProfile, days, setDays } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const [loading, setLoading] = useState(true);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemText, setEditItemText] = useState('');
  const [editItemType, setEditItemType] = useState('map');
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [dayToDelete, setDayToDelete] = useState<string | null>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const canWrite = appUser?.role === 'admin' || appUser?.role === 'editor';

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentTripId) return;
    const q = query(
      collection(db, 'trips', currentTripId, 'itinerary'),
      orderBy('isoDate', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setDays(snap.docs.map(d => ({ docId: d.id, ...d.data() } as ItineraryDay)));
      setLoading(false);
    }, err => {
      console.error(err);
      showToast({ type: 'error', message: t('errors.networkError') });
      setLoading(false);
    });
    return () => unsub();
  }, [currentTripId, setDays, t]);

  // ── Scroll to today ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!days.length || loading) return;
    const today = new Date().toISOString().split('T')[0];
    const todayDay = days.find(d => d.isoDate === today);
    const node = todayDay ? dayRefs.current[todayDay.id] : null;
    if (node) setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [days, loading]);

  // ── AI add item ───────────────────────────────────────────────────────────
  const handleAiAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading || !currentTripId) return;
    setIsAiLoading(true);
    try {
      const dayList = days.map(d => `${d.id} (${d.isoDate}: ${d.title})`).join(', ');
      const prompt = `Parse this trip booking and add to itinerary. Available days: ${dayList}. User input: "${aiInput}". Return ONLY valid JSON: {"dayId":"day_id","itemType":"flight|hotel|food|map|note|car|train|ship|ticket|home","text":"description"}`;
      const text = await callAI(prompt, getProviderForTask('chat'), { isJson: true });
      const parsed = parseAIJson<{ dayId: string; itemType: string; text: string }>(text, { dayId: '', itemType: 'map', text: aiInput });
      const targetDay = days.find(d => d.id === parsed.dayId);
      if (!targetDay) {
        showToast({ type: 'warning', message: 'Could not identify the day. Please include a date.' });
        return;
      }
      const newItem: ItineraryItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: parsed.itemType || 'map',
        text: parsed.text,
      };
      await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', targetDay.docId), {
        items: [...(targetDay.items ?? []), newItem],
      });
      setAiInput('');
      showToast({ type: 'success', message: `Added to: ${targetDay.title}` });
    } catch {
      showToast({ type: 'error', message: t('errors.aiUnavailable') });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAddDay = async () => {
    if (!currentTripId || !canWrite) return;
    
    // Find the max isoDate or default to today
    const maxIsoDate = days.length > 0 ? days[days.length - 1].isoDate : new Date().toISOString().split('T')[0];
    const nextDate = new Date(maxIsoDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const newDay = {
      id: `day_custom_${Date.now()}`,
      title: 'New Day',
      date: nextDate.toLocaleDateString(),
      isoDate: nextDate.toISOString().split('T')[0],
      items: [],
    };
    await addDoc(collection(db, 'trips', currentTripId, 'itinerary'), newDay);
  };

  const confirmDeleteDay = async () => {
    if (!currentTripId || !canWrite || !dayToDelete) return;
    try {
      await deleteDoc(doc(db, 'trips', currentTripId, 'itinerary', dayToDelete));
      showToast({ type: 'success', message: t('app.deleted', 'Deleted successfully') });
    } catch {
      showToast({ type: 'error', message: t('app.error') });
    } finally {
      setDayToDelete(null);
    }
  };

  const handleUpdateDayDate = async (dayDocId: string, newIsoDate: string) => {
    if (!currentTripId || !canWrite) return;
    const dateObj = new Date(newIsoDate);
    if (isNaN(dateObj.getTime())) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayDocId), {
      isoDate: newIsoDate,
      date: dateObj.toLocaleDateString()
    });
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDrop = async (dayDocId: string, currentItems: ItineraryItem[]) => {
    if (draggedDayId !== dayDocId || draggedIdx === null || dragOverIdx === null || draggedIdx === dragOverIdx) {
      setDraggedDayId(null); setDraggedIdx(null); setDragOverIdx(null);
      return;
    }
    const newItems = [...currentItems];
    const [removed] = newItems.splice(draggedIdx, 1);
    newItems.splice(dragOverIdx, 0, removed);
    setDraggedDayId(null); setDraggedIdx(null); setDragOverIdx(null);
    if (!currentTripId) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayDocId), { items: newItems });
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('itinerary.title')}</h2>
        {canWrite && (
          <button onClick={handleAddDay} className="btn-secondary flex items-center gap-2 text-sm py-2">
            <Plus size={15} /> {t('itinerary.newDay')}
          </button>
        )}
      </div>

      {/* Weather */}
      {tripProfile?.destinations?.[0] && (
        <WeatherBanner lat={64.1466} lng={-21.9426} locationName={tripProfile.destinations[0]} />
      )}

      {/* AI add bar */}
      {canWrite && (
        <div className="bg-gradient-to-r from-brand-600 to-indigo-700 p-0.5 rounded-2xl shadow-md">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-3 text-sm">
              <Sparkles size={16} className="text-brand-500" /> {t('itinerary.aiAdd')}
            </h3>
            <form onSubmit={handleAiAdd} className="flex gap-2 items-center">
              <div className="flex flex-1 gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 items-center">
                <input
                  id="ai-add-input"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  placeholder={t('itinerary.aiPlaceholder')}
                  className="flex-1 bg-transparent py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none"
                  disabled={isAiLoading}
                  dir="auto"
                />
                <DictationButton onResult={t2 => setAiInput(p => p + (p ? ' ' : '') + t2)} />
              </div>
              <button
                type="submit"
                id="btn-ai-add"
                disabled={!aiInput.trim() || isAiLoading}
                className="btn-primary flex items-center gap-2 py-2.5"
              >
                {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {!isAiLoading && <span className="hidden sm:inline">{t('itinerary.aiAdd')}</span>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Days list */}
      {days.length === 0 ? (
        <div className="card p-12 text-center text-slate-400 dark:text-slate-500">
          <p className="text-4xl mb-3">🗓️</p>
          <p className="font-medium text-lg mb-4">{t('itinerary.noItems')}</p>
          {canWrite && (
            <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
              <button 
                onClick={() => setShowWizard(true)}
                className="btn-primary flex items-center gap-2 py-3 px-6 text-base font-bold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 shadow-lg"
              >
                <Sparkles size={20} className="text-yellow-300" /> 
                {t('itinerary.buildTripAI')}
              </button>
              <button 
                onClick={handleAddDay} 
                className="btn-secondary py-3 px-6 text-sm"
              >
                {t('itinerary.addManualDay')}
              </button>
            </div>
          )}
        </div>
      ) : (
        days.map(day => (
          <div
            key={day.id}
            ref={el => { dayRefs.current[day.id] = el; }}
            data-dayid={day.id}
            className="card overflow-hidden scroll-mt-24"
          >
            {/* Day header */}
            <div className="bg-slate-50 dark:bg-slate-900/60 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white">
                {day.title}
                {day.items?.some(i => i.fixed) && (
                  <Lock size={12} className="inline ms-2 text-brand-500" aria-label="Contains fixed bookings" />
                )}
              </h3>
              <div className="flex items-center gap-2">
                {canWrite ? (
                  <input
                    type="date"
                    value={day.isoDate || ''}
                    onChange={(e) => handleUpdateDayDate(day.docId, e.target.value)}
                    className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-brand-500"
                  />
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium">
                    {day.date}
                  </span>
                )}
                {canWrite && (
                  <button onClick={() => setDayToDelete(day.docId)} className="p-1.5 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-700 hover:bg-slate-100 rounded-lg transition-all" title={t('app.delete')}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="p-4 space-y-2">
              {(!day.items || day.items.length === 0) ? (
                <p className="text-slate-400 text-sm italic">{t('itinerary.noItems')}</p>
              ) : (
                day.items.map((item, idx) => {
                  const iconInfo = ICON_MAP[item.type] ?? ICON_MAP.map;
                  const isDragging = draggedDayId === day.docId && draggedIdx === idx;
                  const isOver = draggedDayId === day.docId && dragOverIdx === idx && draggedIdx !== idx;

                  return (
                    <div
                      key={item.id}
                      draggable={canWrite && editingItemId !== item.id}
                      onDragStart={() => { setDraggedDayId(day.docId); setDraggedIdx(idx); }}
                      onDragEnter={() => { if (draggedDayId === day.docId) setDragOverIdx(idx); }}
                      onDragOver={e => e.preventDefault()}
                      onDragEnd={() => { setDraggedDayId(null); setDraggedIdx(null); setDragOverIdx(null); }}
                      onDrop={() => handleDrop(day.docId, day.items)}
                      className={`flex items-start gap-2 group p-2 rounded-xl transition-all ${
                        isDragging ? 'opacity-30 scale-95' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      } ${isOver ? 'border-t-2 border-brand-500' : ''}`}
                    >
                      {canWrite && (
                        <div className="mt-2 text-slate-300 dark:text-slate-600 cursor-grab opacity-0 group-hover:opacity-100 shrink-0">
                          <GripVertical size={16} />
                        </div>
                      )}
                      <div className="mt-1 text-xl shrink-0 w-8 text-center">{iconInfo.emoji}</div>
                      <div className="flex-1 min-w-0">
                        {item.fixed && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-1.5 py-0.5 rounded mb-1">
                            <Lock size={9} /> {t('itinerary.fixed')}
                          </span>
                        )}
                        {editingItemId === item.id ? (
                          <div className="space-y-2">
                            <IconSelector selected={editItemType} onSelect={setEditItemType} />
                            <div className="flex gap-2 border dark:border-slate-600 rounded-xl p-2 bg-white dark:bg-slate-700 items-start">
                              <textarea
                                value={editItemText}
                                onChange={e => setEditItemText(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white focus:outline-none resize-none"
                                rows={3}
                                dir="auto"
                              />
                              <DictationButton onResult={t2 => setEditItemText(p => p + (p ? ' ' : '') + t2)} />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={async () => {
                                if (!currentTripId) return;
                                const updated = day.items.map(i => i.id === item.id ? { ...i, text: editItemText, type: editItemType } : i);
                                await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: updated });
                                setEditingItemId(null);
                              }} className="btn-primary text-sm py-1.5 px-3">{t('app.save')}</button>
                              <button onClick={() => setEditingItemId(null)} className="btn-secondary text-sm py-1.5 px-3">{t('app.cancel')}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed itinerary-html-content"
                              dangerouslySetInnerHTML={{ __html: item.text }}
                            />
                            {item.type === 'flight' && (
                              <FlightWidget item={item} dayDocId={day.docId} days={days} />
                            )}
                          </>
                        )}
                      </div>
                      {canWrite && editingItemId !== item.id && !item.fixed && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1">
                          <button
                            onClick={() => { setEditingItemId(item.id); setEditItemText(item.text); setEditItemType(item.type || 'map'); }}
                            className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              if (!currentTripId) return;
                              const updated = day.items.filter(i => i.id !== item.id);
                              await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: updated });
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {canWrite && (
                <button
                  onClick={async () => {
                    if (!currentTripId) return;
                    const newItem: ItineraryItem = { id: `${Date.now()}`, type: 'note', text: 'פריט חדש...' };
                    await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: [...(day.items ?? []), newItem] });
                    setEditingItemId(newItem.id); setEditItemText(''); setEditItemType('note');
                  }}
                  className="text-xs text-slate-400 hover:text-brand-500 flex items-center gap-1 mt-2 py-1 px-2 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                >
                  <Plus size={12} /> {t('app.add')}
                </button>
              )}
            </div>
          </div>
        ))
      )}
      
      {showWizard && <ItineraryWizard onClose={() => setShowWizard(false)} />}

      {/* Delete Day Modal */}
      {dayToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('itinerary.confirmDeleteDay', 'Delete entire day?')}
            </h3>
            <p className="text-sm text-slate-500">
              {t('app.cannotUndo', 'This action cannot be undone. All items inside this day will be lost.')}
            </p>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setDayToDelete(null)} className="flex-1 btn-secondary py-2">{t('app.cancel', 'Cancel')}</button>
              <button onClick={confirmDeleteDay} className="flex-1 btn-primary py-2 bg-red-500 hover:bg-red-600 border-red-500 shadow-red-500/20">{t('app.delete', 'Delete')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
