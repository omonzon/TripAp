import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, query, collection, doc,
  updateDoc, addDoc, deleteDoc, writeBatch,
  orderBy, setDoc, where, getDocs,
} from 'firebase/firestore';
import {
  GripVertical, Plus, Trash2, Edit2, Check, X, Plane, Car, Hotel, Clock, AlertTriangle, AlertCircle, Sparkles, Navigation, Link, Lock, Save, MapPin, Sun, Cloud, Loader2, RefreshCcw, Camera, FileText, ChevronUp, ChevronDown, Info, MessageCircle, MoreVertical, ShieldCheck, User, ExternalLink
} from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore, useUserRole, type ItineraryDay, type ItineraryItem } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { callAI, parseAIJson } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';
import { DictationButton } from '@/components/features/DictationButton';
import { extractDocumentData, integrateDocumentData, type DocumentExtractionResult } from '@/engine/documentAnalyzer';
import DocumentAnalysisReviewModal from '@/components/documents/DocumentAnalysisReviewModal';
import ItineraryWizard from './ItineraryWizard';
import LocationInfoModal from '@/components/LocationInfoModal';
import DailyBriefingModal from '@/components/DailyBriefingModal';
import { compressImageToBase64 } from '@/utils/imageCompressor';
import { getTripWeather, getWeatherMeta, type WeatherInfo } from '@/services/weatherService';

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
  const userRole = useUserRole();
  const canWrite = userRole === 'admin' || userRole === 'editor';

  const refresh = async () => {
    if (!currentTripId) return;
    setRefreshing(true);
    try {
      const prompt = `You are a flight tracker. Predict live tracking info for this flight context. Return ONLY valid JSON: {"status":"On Time","terminal":"3","gate":"A12","checkin":"Desk 4","time":"14:00"}. Context: "${item.text}"`;
      const text = await callAI(prompt, getProviderForTask('chat'), { isJson: true });
      const parsed = parseAIJson<Record<string, string>>(text, {});
      const cleanParsed = JSON.parse(JSON.stringify(parsed));
      const day = days.find(d => d.docId === dayDocId);
      if (!day) return;
      const updatedItems = day.items.map(i => i.id === item.id ? { ...i, flightData: cleanParsed } : i);
      await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayDocId), { items: updatedItems });
      showToast({ type: 'success', message: t('itinerary.flightSynced', 'Flight synced successfully.') });
    } catch (e: any) {
      console.error('Flight sync error:', e);
      showToast({ type: 'error', message: t('itinerary.flightSyncFailed', 'Flight sync failed.') + ' ' + (e.message || '') });
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
        {canWrite && (
          <button onClick={refresh} disabled={refreshing} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
            {refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
            {t('itinerary.sync')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[
          { label: t('itinerary.flight.time'), val: item.flightData?.time ?? '--:--' },
          { label: t('itinerary.flight.status'), val: item.flightData?.status ?? '-', highlight: true },
          { label: t('itinerary.flight.terminalGate'), val: document.documentElement.dir === 'rtl' ? `${item.flightData?.gate ?? '-'}${item.flightData?.terminal ? `/T${item.flightData.terminal}` : ''}` : `${item.flightData?.terminal ? `T${item.flightData.terminal}/` : ''}${item.flightData?.gate ?? '-'}` },
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

// ── Service Links Widget ───────────────────────────────────────────────────────
function ServiceLinks({ item, isoDate, participantsCount, tripName, isLastDay, city }: { item: ItineraryItem, isoDate: string, participantsCount: number, tripName: string, isLastDay?: boolean, city?: string }) {
  const handleClick = (e: React.MouseEvent) => e.stopPropagation();

  if (isLastDay && item.type === 'flight') return null;

  const cleanText = encodeURIComponent(item.text.replace(/<[^>]*>?/gm, '').trim() || tripName);

  let customLinks: React.ReactNode[] = [];
  if (item.type === 'food') {
    const cleanHtmlText = item.text.replace(/<[^>]*>?/gm, '').trim();
    let foodSearchText = cleanHtmlText.includes(':') 
      ? cleanHtmlText.split(':').pop()?.trim() 
      : cleanHtmlText.split(/[.\-]/).pop()?.trim() || cleanHtmlText;
      
    const query = encodeURIComponent(`${foodSearchText} ${city || tripName}`.trim());
    
    customLinks.push(
      <a key="food" href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noreferrer" onClick={handleClick} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-red-800">
        <MapPin size={10} /> Google Maps
      </a>
    );
  }

  if (item.referrals && item.referrals.length > 0) {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {customLinks}
        {item.referrals.map((ref, idx) => {
          let url = ref.url;
          if (url.includes('rentalcars.com')) url = 'https://www.rentalcars.com/'; // Clean up bad rentalcars link
          if (item.type === 'flight') return null; // We use our own flight links with passenger counts
          if (item.type === 'food') return null; // We use our own Maps link
          return (
            <a key={idx} href={url} target="_blank" rel="noreferrer" onClick={handleClick} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors border border-emerald-200 dark:border-emerald-800">
              <Link size={10} /> {ref.title}
            </a>
          );
        })}
      </div>
    );
  }

  // Fallback defaults
  if (item.type !== 'hotel' && item.type !== 'home' && item.type !== 'flight') return null;

  const getNextDay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  };

  const nextIsoDate = getNextDay(isoDate);
  
  const shortSearchTerm = item.text.replace(/<[^>]*>?/gm, '').split(/[,.\n-]/)[0].trim() || tripName;

  if (item.type === 'flight') {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <a href={`https://www.google.com/travel/flights?q=${encodeURIComponent('Flights ' + shortSearchTerm)}%20on%20${isoDate}`} target="_blank" rel="noreferrer" onClick={handleClick} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors border border-sky-200 dark:border-sky-800">
          <Plane size={10} /> Google Flights
        </a>
      </div>
    );
  }

  // Accommodations (hotel, home)
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {customLinks}
      <a href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(shortSearchTerm)}&checkin=${isoDate}&checkout=${nextIsoDate}&group_adults=${participantsCount}`} target="_blank" rel="noreferrer" onClick={handleClick} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800">
        <Hotel size={10} /> Booking.com
      </a>
      <a href={`https://www.expedia.com/Hotel-Search?destination=${encodeURIComponent(shortSearchTerm)}&startDate=${isoDate}&endDate=${nextIsoDate}&adults=${participantsCount}`} target="_blank" rel="noreferrer" onClick={handleClick} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors border border-yellow-200 dark:border-yellow-800">
        <Hotel size={10} /> Expedia
      </a>
    </div>
  );
}

// ── Main Itinerary View ───────────────────────────────────────────────────────
const SCAN_LOADING_PHRASES = [
  "קורא את האותיות הקטנות...",
  "מפענח כתב חרטומים...",
  "מחפש תאריכים ושעות...",
  "מכין את ההזמנה שלך למסלול...",
  "אוטוטו מסיימים..."
];

export default function ItineraryView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { currentTripId, tripProfile, days, setDays } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const [loading, setLoading] = useState(true);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const [editItemText, setEditItemText] = useState('');
  const [editItemType, setEditItemType] = useState('map');
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showFlightModal, setShowFlightModal] = useState(false);
  const [detailedItem, setDetailedItem] = useState<{dayDocId: string, item: ItineraryItem} | null>(null);
  const [scannedDocumentData, setScannedDocumentData] = useState<DocumentExtractionResult | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingMapForDay, setEditingMapForDay] = useState<string | null>(null);
  const [tempMapUrl, setTempMapUrl] = useState('');
  const [dayToDelete, setDayToDelete] = useState<string | null>(null);
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [scanPhraseIndex, setScanPhraseIndex] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [infoLocation, setInfoLocation] = useState<string | null>(null);
  const [showDailyBriefing, setShowDailyBriefing] = useState(false);
  const [briefingTasks, setBriefingTasks] = useState<any[]>([]);
  const [isScanningReferrals, setIsScanningReferrals] = useState(false);
  const [todayItems, setTodayItems] = useState<ItineraryItem[]>([]);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherInfo>>({});
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherInfo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null!);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const todayIso = new Date().toISOString().split('T')[0];
  const userRole = useUserRole();
  const canWrite = userRole === 'admin' || userRole === 'editor';

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentTripId) return;
    setLoading(true);
    setDays([]);
    setHasScrolled(false);
    setShowDailyBriefing(false);
    
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
  }, [currentTripId]);

  // Track Last Viewed Day via getBoundingClientRect (Bulletproof)
  useEffect(() => {
    if (!currentTripId || days.length === 0 || !hasScrolled) return;
    
    let timeout: any;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        let closestDayId = null;
        Object.entries(dayRefs.current).forEach(([dayId, el]) => {
          if (el) {
            const rect = el.getBoundingClientRect();
            // If the element crosses the 150px mark from top of viewport, it is the active one
            if (rect.top <= 150 && rect.bottom >= 150) {
              closestDayId = dayId;
            }
          }
        });

        if (closestDayId) {
          localStorage.setItem(`lastViewedDay_${currentTripId}`, closestDayId);
        }
      }, 300);
    };

    // Use capture phase to ensure we catch scroll events from any nested scrollable container
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(timeout);
    };
  }, [days, currentTripId, hasScrolled]);

  // ── Fetch Weather ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tripProfile || !tripProfile.destinations || tripProfile.destinations.length === 0 || days.length === 0) return;
    const fetchWeather = async () => {
      const daysInput = days.map(d => ({ isoDate: d.isoDate, title: d.title, locationNameEn: d.locationNameEn }));
      const wMap = await getTripWeather(daysInput, tripProfile.destinations, tripProfile.startDate, tripProfile.endDate);
      setWeatherMap(wMap);
      
      // Calculate extreme weather alerts within 4 days
      const today = new Date();
      const alerts: WeatherInfo[] = [];
      for (let i = 0; i <= 4; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() + i);
        const iso = checkDate.toISOString().split('T')[0];
        if (wMap[iso] && wMap[iso].isExtreme) {
          alerts.push(wMap[iso]);
        }
      }
      setWeatherAlerts(alerts);
    };
    fetchWeather();
  }, [tripProfile, days]); // added days to dependency array to update weather if locationNameEn changes

  // ── Extract missing English location names for accurate weather ──────────
  useEffect(() => {
    if (!currentTripId || days.length === 0 || !canWrite) return;
    const daysWithoutLoc = days.filter(d => !d.locationNameEn);
    if (daysWithoutLoc.length === 0) return;

    const extractLocations = async () => {
      const daysStr = daysWithoutLoc.map(d => `${d.docId}: ${d.title}`).join('\n');
      const prompt = `Extract the main city or town name in English for each of the following days from a travel itinerary. 
For each line, identify the primary city where the person will be. Return ONLY a JSON object mapping the ID to the exact English city name. For example: {"day123": "Amsterdam", "day456": "Groningen"}.
If a day title has no city, do your best to infer from context or return the most logical location.
Here are the days:
${daysStr}`;

      try {
        const text = await callAI(prompt, getProviderForTask('extraction'), { isJson: true });
        const result = parseAIJson<Record<string, string>>(text, {});
        
        // Update Firestore for each missing day
        for (const [docId, locName] of Object.entries(result)) {
           if (locName && typeof locName === 'string' && locName.trim()) {
             await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', docId), {
               locationNameEn: locName.trim()
             });
           }
        }
      } catch (err) {
        console.error("Failed to extract locations", err);
      }
    };

    // Delay extraction to not block UI/weather loading
    const t = setTimeout(extractLocations, 3000);
    return () => clearTimeout(t);
  }, [days, currentTripId, canWrite]);

  // ── Scroll to today & Check Briefing ──────────────────────────────────────
  useEffect(() => {
    if (days.length > 0 && !hasScrolled) {
      const todayDay = days.find(d => d.isoDate === todayIso);
      const lastViewedDayId = currentTripId ? localStorage.getItem(`lastViewedDay_${currentTripId}`) : null;
      
      // If today is in the trip, prioritize today, else use last viewed, else use first day
      const targetId = todayDay?.id || lastViewedDayId || days[0].id;
      
      setTimeout(() => {
        if (dayRefs.current[targetId]) {
          dayRefs.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 500);
      setHasScrolled(true);

      // Check for Daily Briefing
      if (currentTripId && tripProfile) {
        const briefingKey = `briefing_${currentTripId}_${todayIso}`;
        if (!localStorage.getItem(briefingKey)) {
          if (todayIso < tripProfile.startDate) {
            // Pre-trip: fetch remaining tasks
            const q = query(collection(db, 'trips', currentTripId, 'tasks'), where('completed', '==', false));
            getDocs(q).then((snap: any) => {
              const pendingTasks = snap.docs.map((d: any) => d.data())
                .filter((t: any) => t.category === 'planning' || t.category === 'pre_trip');
              if (pendingTasks.length > 0) {
                setTodayItems([]);
                setBriefingTasks(pendingTasks);
                setShowDailyBriefing(true);
                localStorage.setItem(briefingKey, 'true');
              } else {
                localStorage.setItem(briefingKey, 'true');
              }
            });
          } else if (todayDay) {
            setTodayItems(todayDay.items || []);
            setBriefingTasks([]);
            setShowDailyBriefing(true);
            localStorage.setItem(briefingKey, 'true');
          }
        }
      }
    }
  }, [days, hasScrolled, todayIso, currentTripId, tripProfile]);

  useEffect(() => {
    if (isScanningDoc) {
      const i = setInterval(() => setScanPhraseIndex(p => (p + 1) % SCAN_LOADING_PHRASES.length), 2500);
      return () => clearInterval(i);
    }
  }, [isScanningDoc]);

  // ── AI add item ───────────────────────────────────────────────────────────
  const handleAiAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading || !currentTripId) return;

    if (aiInput.trim().startsWith('AIzaSy')) {
      useAIStore.getState().setApiKey(aiInput.trim());
      setAiInput('');
      showToast({ type: 'info', message: t('settings.apiKeyDetected', 'API Key detected! Redirecting to settings to validate...') });
      window.dispatchEvent(new CustomEvent('change-tab', { detail: 'settings' }));
      return;
    }

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
        id: Date.now().toString(),
        type: parsed.itemType || 'map',
        text: parsed.text,
        authorName: appUser?.name || 'User',
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

  const handleUpdateDayDate = async (dayId: string, isoDate: string) => {
    if (!currentTripId) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayId), { isoDate });
  };

  const handleUpdateDayMap = async (dayId: string) => {
    if (!currentTripId) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayId), { mapUrl: tempMapUrl });
    setEditingMapForDay(null);
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

  const handleMove = async (dayDocId: string, itemIdx: number, direction: number) => {
    const day = days.find(d => d.docId === dayDocId);
    if (!day || !day.items) return;
    const newItems = [...day.items];
    const targetIdx = itemIdx + direction;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    
    const temp = newItems[itemIdx];
    newItems[itemIdx] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    
    if (!currentTripId) return;
    await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', dayDocId), { items: newItems });
  };

  const handleScanDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tripProfile || !appUser) return;
    
    // If the user has no API key, prompt them to add it.
    const apiKey = useAIStore.getState().apiKey;
    if (!apiKey) {
      showToast({ type: 'warning', message: t('itinerary.missingApiKey', 'Please set your Gemini API key in Settings first.') });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setIsScanningDoc(true);
    showToast({ type: 'info', message: t('itinerary.scanningDoc', 'Scanning document and updating trip...') });

    try {
      let base64 = '';
      if (file.type.startsWith('image/')) {
        base64 = await compressImageToBase64(file);
      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read document'));
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
      }

      const res = await extractDocumentData(
        tripProfile,
        base64,
        file.type,
        getProviderForTask('extraction')
      );
      
      setScannedDocumentData(res);
    } catch (err: any) {
      if (!navigator.onLine || err.message?.includes('fetch') || err.message?.includes('network')) {
        showToast({ type: 'error', message: 'שגיאת חיבור. לסריקה ופעולות חכמות נדרש חיבור אינטרנט וגישה ל-AI. אנא ודא חיבור ונסה שוב.' });
      } else {
        showToast({ type: 'error', message: t('errors.scanFailed', 'Failed to scan document.') });
      }
    } finally {
      setIsScanningDoc(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirmScannedData = async (approvedData: DocumentExtractionResult) => {
    if (!tripProfile || !appUser) return;
    setScannedDocumentData(null);
    showToast({ type: 'info', message: t('itinerary.savingScanned', 'Saving approved details...') });
    
    try {
      await integrateDocumentData(
        tripProfile,
        days,
        approvedData,
        appUser.email
      );



      showToast({ 
        type: 'success', 
        message: t('itinerary.scanSuccess', 'Document integrated successfully!') 
      });
    } catch (err) {
      showToast({ type: 'error', message: t('errors.saveFailed', 'Failed to save details.') });
    }
  };

  const handleScanReferrals = async () => {
    if (!currentTripId || !tripProfile || !days.length) return;
    
    const apiKey = useAIStore.getState().apiKey;
    if (!apiKey) {
      showToast({ type: 'warning', message: t('itinerary.missingApiKey', 'Please set your Gemini API key in Settings first.') });
      return;
    }

    setIsScanningReferrals(true);
    showToast({ type: 'info', message: 'סורק ומייצר הפניות הזמנה...' });

    try {
      // 1. De-duplicate consecutive identical items
      const dayUpdates: Record<string, ItineraryItem[]> = {};
      let duplicatesRemoved = 0;
      
      const cleanDays = days.map(d => {
        const uniqueItems: ItineraryItem[] = [];
        for (const item of d.items) {
          const prev = uniqueItems[uniqueItems.length - 1];
          if (!prev || prev.text.trim() !== item.text.trim()) {
            uniqueItems.push(item);
          } else {
            duplicatesRemoved++;
          }
        }
        if (uniqueItems.length !== d.items.length) {
          dayUpdates[d.docId] = uniqueItems;
        }
        return { ...d, items: uniqueItems };
      });

      const itemsToScan = cleanDays.flatMap(d => d.items.map(i => ({ dayId: d.docId, item: i }))).filter(x => !x.item.referrals || x.item.referrals.length === 0);
      
      if (itemsToScan.length === 0 && duplicatesRemoved === 0) {
        showToast({ type: 'success', message: 'כל ההפניות מעודכנות!' });
        setIsScanningReferrals(false);
        return;
      }

      if (itemsToScan.length > 0) {
        const itemsPayload = itemsToScan.map(x => ({ id: x.item.id, text: x.item.text, type: x.item.type }));
        
        const prompt = `Identify relevant booking/referral aggregator search links for these trip activities based on their type and text.
The trip destination is ${tripProfile.destinations.join(', ')}.
Dates: ${tripProfile.startDate} to ${tripProfile.endDate}.
Participants: ${tripProfile.participants.length} total.

Return ONLY valid JSON in this exact schema:
{
  "results": [
    {
      "id": "item_id_here",
      "referrals": [
        { "title": "short title (e.g. Booking.com, Viator, Rentalcars, PADI)", "url": "valid search URL" }
      ]
    }
  ]
}

CRITICAL: Include the exact dates and participant counts in the URL query strings to make the links precise!
IMPORTANT: Do NOT include the entire activity text in the search queries! Use concise keywords (e.g., just the city name or flight route).
Guidelines for URLs:
- Car rental: https://www.expedia.com/carsearch?locn=CITY_NAME&d1=${tripProfile.startDate}&d2=${tripProfile.endDate}
- Hotel/Accommodation: https://www.booking.com/searchresults.html?ss=CITY_NAME&checkin=${tripProfile.startDate}&checkout=${tripProfile.endDate}&group_adults=${tripProfile.participants.length}
- Expedia: https://www.expedia.com/Hotel-Search?destination=CITY_NAME&startDate=${tripProfile.startDate}&endDate=${tripProfile.endDate}&adults=${tripProfile.participants.length}
- Flights: https://www.google.com/travel/flights?q=Flights%20CITY_NAME%20ACTIVITY
- Tours/Attractions/Cruises/Ski: https://www.viator.com/searchResults/all?text=CITY_NAME+ACTIVITY

Items to process:
${JSON.stringify(itemsPayload, null, 2)}`;

        const system = `You are an expert travel assistant API. Return ONLY JSON.`;
        
        const response = await callAI([{ role: 'user', text: prompt }], getProviderForTask('chat'), { systemInstruction: system });
        const parsed = parseAIJson<{ results: { id: string; referrals: { title: string; url: string; icon?: string }[] }[] }>(response, { results: [] });
        
        if (parsed && parsed.results) {
          for (const res of parsed.results) {
            const original = itemsToScan.find(x => x.item.id === res.id);
            if (original) {
              const dayId = original.dayId;
              if (!dayUpdates[dayId]) {
                const d = cleanDays.find(day => day.docId === dayId);
                if (d) dayUpdates[dayId] = [...d.items];
              }
              const itemIdx = dayUpdates[dayId].findIndex(i => i.id === res.id);
              if (itemIdx >= 0) {
                dayUpdates[dayId][itemIdx] = { ...dayUpdates[dayId][itemIdx], referrals: res.referrals };
              }
            }
          }
        }
      }

      if (Object.keys(dayUpdates).length > 0) {
        const batch = writeBatch(db);
        for (const [dayDocId, updatedItems] of Object.entries(dayUpdates)) {
          const ref = doc(db, 'trips', currentTripId, 'itinerary', dayDocId);
          batch.update(ref, { items: updatedItems });
        }
        await batch.commit();

        showToast({ type: 'success', message: duplicatesRemoved > 0 ? `נמצאו הפניות חדשות, והוסרו ${duplicatesRemoved} כפילויות!` : 'נמצאו הפניות חדשות להזמנות!' });
      } else {
        showToast({ type: 'success', message: 'אין הפניות חדשות להוספה.' });
      }
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'שגיאה בסריקת הפניות' });
    } finally {
      setIsScanningReferrals(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('itinerary.title')}</h2>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button onClick={handleScanReferrals} disabled={isScanningReferrals} title="סריקה חכמה לאיתור קישורי הזמנה חסרים (טיסות, מלונות) לפריטי המסלול." className="btn-secondary flex items-center gap-2 text-sm py-2 px-3">
              {isScanningReferrals ? <Loader2 size={15} className="animate-spin" /> : <Link size={15} />} 
              <span className="hidden sm:inline">סרוק הפניות</span>
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={isScanningDoc} title="העלאת מסמך או צילום מסך כדי לחלץ מידע ולשבץ אותו אוטומטית במסלול." className="btn-secondary flex items-center gap-2 text-sm py-2 px-3">
              {isScanningDoc ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} 
              <span className="hidden sm:inline">{t('itinerary.scanDoc', 'Scan Doc')}</span>
            </button>
            <input ref={fileRef} type="file" accept="application/pdf, image/*" capture="environment" className="hidden" onChange={handleScanDocument} />
            <button onClick={handleAddDay} title="הוספת יום חדש וריק למסלול הטיול." className="btn-secondary flex items-center gap-2 text-sm py-2 px-3">
              <Plus size={15} /> <span className="hidden sm:inline">{t('itinerary.newDay')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Weather removed from here, moving to day cards */}

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
        days.map(day => {
          const isToday = day.isoDate === todayIso;
          const weather = weatherMap[day.isoDate];
          const weatherMeta = weather ? getWeatherMeta(weather.code) : null;
          
          return (
          <div
            key={day.id}
            data-day-id={day.id}
            ref={el => { dayRefs.current[day.id] = el; }}
            className={`card overflow-hidden scroll-mt-24 ${isToday ? 'ring-2 ring-brand-500 shadow-brand-500/20 dark:shadow-brand-500/10' : ''}`}
          >
            {/* Day header */}
            <div className={`px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between ${isToday ? 'bg-brand-50 dark:bg-brand-900/40' : 'bg-slate-50 dark:bg-slate-900/60'}`}>
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

            {/* Weather Bubble */}
            {weather && weatherMeta && (
              <div className={`mx-4 mb-2 p-2 rounded-xl bg-gradient-to-r ${weatherMeta.bgClass} flex items-center gap-3 shadow-sm ${weather.isExtreme ? 'border-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse-slight' : 'border border-white/50 dark:border-slate-700'}`}>
                <div className="text-2xl drop-shadow-sm">{weatherMeta.emoji}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-white text-sm">
                      {weather.maxTemp}°C <span className="text-slate-500 font-normal">/ {weather.minTemp}°C</span>
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${weather.isForecast ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                      {weather.isForecast ? t('itinerary.forecast', 'תחזית') : t('itinerary.currentWeather', 'עכשווי')}
                    </span>
                    {weather.locationName && (
                      <span className="text-[10px] font-medium text-slate-500 flex items-center gap-0.5 ms-1">
                        <MapPin size={10} /> {weather.locationName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 flex flex-wrap items-center gap-2">
                    <span>{weatherMeta.desc}</span>
                    {weather.windSpeed > 0 && <span className="text-[10px] bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded text-slate-500">💨 {weather.windSpeed} km/h</span>}
                    {weather.precipitation > 0 && <span className="text-[10px] bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded text-slate-500">🌧️ {weather.precipitation} mm</span>}
                    
                    {weather.warnings && weather.warnings.length > 0 && (
                      <span className="ms-1 text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-bold px-1.5 py-0.5 rounded">
                        ⚠️ {weather.warnings.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <a 
                  href={`https://www.google.com/search?q=${encodeURIComponent('weather ' + (weather.locationName || '') + (weather.isForecast ? ' ' + weather.date : ''))}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 -mr-1 rounded-full text-slate-400 hover:text-blue-500 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  title={t('itinerary.viewWeather', 'צפה בתחזית המלאה')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            )}

            {/* Map Section */}
            {(day.mapUrl || editingMapForDay === day.docId || canWrite) && (
              <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
                {editingMapForDay === day.docId ? (
                  <div className="flex w-full items-center gap-2">
                    <input
                      type="url"
                      placeholder="Google Maps URL"
                      value={tempMapUrl}
                      onChange={e => setTempMapUrl(e.target.value)}
                      className="input-base text-xs py-1.5 flex-1"
                      dir="ltr"
                    />
                    <button onClick={() => handleUpdateDayMap(day.docId)} className="btn-primary p-1.5" title={t('app.save')}>
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingMapForDay(null)} className="btn-secondary p-1.5" title={t('app.cancel')}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    {day.mapUrl && (
                      <a href={day.mapUrl} target="_blank" rel="noopener noreferrer" className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer">
                        <MapPin size={12} className="me-1" /> View Map
                      </a>
                    )}
                    {canWrite && (
                      <button 
                        onClick={() => { setEditingMapForDay(day.docId); setTempMapUrl(day.mapUrl || ''); }}
                        className="text-xs text-slate-500 hover:text-brand-500 font-medium"
                      >
                        {day.mapUrl ? t('app.edit') : '+ Add Map'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

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
                      onClick={() => {
                        if (actionMenuId === item.id) {
                          setActionMenuId(null);
                          return;
                        }
                        if (editingItemId !== item.id) {
                          setDetailedItem({ dayDocId: day.docId, item });
                          if (currentTripId) {
                            localStorage.setItem(`lastViewedDay_${currentTripId}`, day.docId);
                          }
                        }
                      }}
                      onTouchStart={(e) => {
                        swipeStartX.current = e.touches[0].clientX;
                        swipeStartY.current = e.touches[0].clientY;
                        touchTimer.current = setTimeout(() => {
                          setActionMenuId(item.id);
                        }, 500);
                      }}
                      onTouchEnd={(e) => { 
                        if (touchTimer.current) clearTimeout(touchTimer.current); 
                        if (swipeStartX.current !== null && swipeStartY.current !== null) {
                          const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
                          const deltaY = e.changedTouches[0].clientY - swipeStartY.current;
                          // If swiped mostly horizontally and distance is > 40px
                          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
                            // Toggle action menu on horizontal swipe
                            setActionMenuId(actionMenuId === item.id ? null : item.id);
                          }
                        }
                        swipeStartX.current = null;
                        swipeStartY.current = null;
                      }}
                      onTouchMove={(e) => { 
                        if (touchTimer.current) {
                          // Cancel long press if finger moves significantly
                          if (swipeStartX.current !== null && swipeStartY.current !== null) {
                            const dx = e.touches[0].clientX - swipeStartX.current;
                            const dy = e.touches[0].clientY - swipeStartY.current;
                            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                              clearTimeout(touchTimer.current);
                            }
                          } else {
                            clearTimeout(touchTimer.current);
                          }
                        }
                      }}
                      className={`bubble flex items-start gap-3 group p-3 sm:p-4 mb-3 transition-all cursor-pointer relative overflow-visible ${
                        isDragging ? 'opacity-30 scale-95' : ''
                      } ${isOver ? 'border-t-2 border-brand-500' : ''}`}
                    >
                      {canWrite && (
                        <div className="mt-2 text-slate-300 dark:text-slate-600 cursor-grab opacity-0 group-hover:opacity-100 shrink-0">
                          <GripVertical size={16} />
                        </div>
                      )}
                      <div className="mt-1 text-xl shrink-0 w-8 text-center">{iconInfo.emoji}</div>
                      <div className="flex-1 mt-1">
                        {editingItemId === item.id ? (
                          <div className="space-y-2 mt-2">
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
                                if (!editItemText.trim()) {
                                  const updated = day.items.filter(i => i.id !== item.id);
                                  await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: updated });
                                } else {
                                  const updated = day.items.map(i => i.id === item.id ? { ...i, text: editItemText, type: editItemType } : i);
                                  await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: updated });
                                }
                                setEditingItemId(null);
                              }} className="btn-primary text-sm py-1.5 px-3">{t('app.save')}</button>
                              <button onClick={async () => {
                                if (!currentTripId) return;
                                if (item.text === 'פריט חדש...' && !editItemText.trim()) {
                                  const updated = day.items.filter(i => i.id !== item.id);
                                  await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: updated });
                                }
                                setEditingItemId(null);
                              }} className="btn-secondary text-sm py-1.5 px-3">{t('app.cancel')}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed itinerary-html-content" dangerouslySetInnerHTML={{ __html: item.text }} />
                            {<div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1 font-medium bg-slate-50 dark:bg-slate-800/50 w-max px-2 py-0.5 rounded">
                              {(item.authorName || 'AI') === 'AI' ? <Sparkles size={10} className="text-brand-500" /> : <User size={10} />}
                              {item.authorName || 'AI'}
                            </div>}
                            {['map', 'ticket', 'food', 'hotel', 'location', 'poi'].includes(item.type || '') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setInfoLocation(item.text.replace(/<[^>]*>?/gm, '').trim()); }}
                                className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                              >
                                <Info size={10} />
                                {t('itinerary.expand', 'Expand')}
                              </button>
                            )}
                            {item.fixed && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-1.5 py-0.5 rounded mt-1 mb-1">
                                <Lock size={9} /> {t('itinerary.fixed')}
                              </span>
                            )}
                            <div className="mt-2">
                              <ServiceLinks item={item} isoDate={day.isoDate || day.date} participantsCount={tripProfile?.participants?.length || 2} tripName={tripProfile?.name || ''} isLastDay={idx === days.length - 1} city={tripProfile?.destinations?.[0] || ''} />
                            </div>
                            {item.type === 'flight' && (
                              <FlightWidget item={item} dayDocId={day.docId} days={days} />
                            )}
                          </>
                        )}
                      </div>
                      {canWrite && editingItemId !== item.id && !item.fixed && (
                        <div className={`flex flex-wrap sm:flex-nowrap items-center gap-1 transition-opacity shrink-0 mt-1 w-16 sm:w-auto justify-end ${actionMenuId === item.id ? 'opacity-100' : 'opacity-0 sm:group-hover:opacity-100 hidden sm:flex'}`}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingItemId(item.id); setEditItemText(item.text); setEditItemType(item.type || 'map'); setActionMenuId(null); }}
                            className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg bg-slate-100 dark:bg-slate-800 sm:bg-transparent hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActionMenuId(null);
                              if (!currentTripId) return;
                              if (!confirm(t('app.confirmDelete', 'Are you sure?'))) return;
                              const updated = day.items.filter(i => i.id !== item.id);
                              await updateDoc(doc(db, 'trips', currentTripId, 'itinerary', day.docId), { items: updated });
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg bg-slate-100 dark:bg-slate-800 sm:bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                          {idx > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMove(day.docId, idx, -1); setActionMenuId(null); }}
                              className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg bg-slate-100 dark:bg-slate-800 sm:bg-transparent hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors sm:hidden"
                            >
                              <ChevronUp size={14} />
                            </button>
                          )}
                          {idx < day.items.length - 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMove(day.docId, idx, 1); setActionMenuId(null); }}
                              className="p-1.5 text-slate-400 hover:text-brand-500 rounded-lg bg-slate-100 dark:bg-slate-800 sm:bg-transparent hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors sm:hidden"
                            >
                              <ChevronDown size={14} />
                            </button>
                          )}
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
          );
        })
      )}
      
      {showWizard && <ItineraryWizard onClose={() => setShowWizard(false)} />}

      {/* Delete Day Modal */}
      {dayToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800 text-center relative">
            <button onClick={() => setDayToDelete(null)} className="absolute top-4 end-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={20} />
            </button>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2 mt-2">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">
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

      {/* Detailed Item Modal */}
      {detailedItem && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex justify-center items-start px-4 pb-4 pt-20 sm:pt-24 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailedItem(null)} className="absolute top-4 end-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center text-2xl">
                {(ICON_MAP[detailedItem.item.type] ?? ICON_MAP.map).emoji}
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white capitalize">
                {detailedItem.item.type}
              </h3>
            </div>
            
            <div
              className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed itinerary-html-content mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700"
              dangerouslySetInnerHTML={{ __html: detailedItem.item.text }}
            />

            {detailedItem.item.type === 'flight' && (
              <FlightWidget item={detailedItem.item} dayDocId={detailedItem.dayDocId} days={days} />
            )}
            
            <div className="mt-6 flex justify-end">
              <button onClick={() => setDetailedItem(null)} className="btn-primary py-2 px-6">
                {t('app.close', 'Close')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Location Info Modal */}
      {infoLocation && (
        <LocationInfoModal locationName={infoLocation} onClose={() => setInfoLocation(null)} />
      )}

      {/* Daily Briefing Modal */}
      {showDailyBriefing && (
        <DailyBriefingModal 
          todayItems={todayItems}
          pendingTasks={briefingTasks}
          weatherAlerts={weatherAlerts}
          tripName={tripProfile?.name || ''} 
          onClose={() => {
            setShowDailyBriefing(false);
            setBriefingTasks([]);
          }} 
        />
      )}

      {/* Document Scanning Review Modal */}
      {scannedDocumentData && (
        <DocumentAnalysisReviewModal
          data={scannedDocumentData}
          onConfirm={handleConfirmScannedData}
          onCancel={() => setScannedDocumentData(null)}
        />
      )}

      {/* Scanning Overlay */}
      {isScanningDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <Loader2 size={48} className="animate-spin text-brand-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2 transition-all">
               {SCAN_LOADING_PHRASES[scanPhraseIndex]}
            </h3>
            <p className="text-sm text-slate-500">זה יכול לקחת כמה שניות...</p>
          </div>
        </div>
      )}
    </div>
  );
}
