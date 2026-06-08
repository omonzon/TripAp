import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onSnapshot, collection, doc, setDoc, deleteDoc, query,
} from 'firebase/firestore';
import { Navigation, Loader2, MapPin, Wifi, WifiOff, Sparkles } from 'lucide-react';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useAIStore } from '@/store/useAIStore';
import { callAI } from '@/services/ai';
import { showToast } from '@/components/ui/Toast';

interface UserLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  updatedAt: number;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeSince(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function LocationView() {
  const { t } = useTranslation();
  const { appUser } = useAuthStore();
  const { currentTripId } = useTripStore();
  const { getProviderForTask } = useAIStore();

  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [loadingRec, setLoadingRec] = useState(false);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!currentTripId) return;
    const unsub = onSnapshot(collection(db, 'trips', currentTripId, 'locations'), snap => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserLocation)));
    });
    return () => unsub();
  }, [currentTripId]);

  const toggleSharing = () => {
    if (sharing) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      setSharing(false);
      return;
    }
    if (!navigator.geolocation) {
      showToast({ type: 'error', message: t('errors.noLocation') });
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setMyLoc({ lat, lng });
        if (!currentTripId || !appUser) return;

        // Reverse geocode
        let address = '';
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          address = d.display_name?.split(',').slice(0, 3).join(', ') || '';
        } catch { /* offline */ }

        await setDoc(doc(db, 'trips', currentTripId, 'locations', appUser.email), {
          name: appUser.name,
          lat, lng, address, updatedAt: Date.now(),
        });
      },
      () => showToast({ type: 'error', message: t('errors.noLocation') }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
    setSharing(true);
  };

  const getNearbyRec = async () => {
    if (!myLoc) return;
    setLoadingRec(true);
    try {
      const prompt = `I'm a traveler at coordinates lat=${myLoc.lat.toFixed(4)}, lng=${myLoc.lng.toFixed(4)}. Suggest 5 nearby things to do or eat within 1km. Format as a short numbered list in Hebrew.`;
      const rec = await callAI(prompt, getProviderForTask('chat'));
      setAiRecommendation(rec);
    } catch {
      showToast({ type: 'error', message: t('errors.aiUnavailable') });
    } finally {
      setLoadingRec(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('locations.title')}</h2>

      {/* Sharing toggle */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {sharing ? <Wifi className="text-green-500" size={20} /> : <WifiOff className="text-slate-400" size={20} />}
          <div>
            <p className="font-semibold text-slate-800 dark:text-white text-sm">{t('locations.sharing')}</p>
            <p className="text-xs text-slate-500">{sharing ? t('locations.online') : t('locations.sharingOff')}</p>
          </div>
        </div>
        <button
          id="btn-toggle-location"
          onClick={toggleSharing}
          className={`relative w-12 h-6 rounded-full transition-all duration-300 ${sharing ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${sharing ? 'left-6' : 'left-0.5'}`} />
        </button>
      </div>

      {/* AI recommendations */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
            <Sparkles size={16} className="text-brand-500" /> {t('locations.recommendations')}
          </h3>
          <button
            id="btn-nearby-rec"
            onClick={getNearbyRec}
            disabled={loadingRec || !myLoc}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
          >
            {loadingRec ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
            {t('locations.findNearby')}
          </button>
        </div>
        {aiRecommendation ? (
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed ai-chat-content" dir="rtl">
            {aiRecommendation}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{!myLoc ? t('locations.sharingOff') : t('locations.findNearby')}</p>
        )}
      </div>

      {/* Location cards */}
      <div className="space-y-3">
        {locations.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            <MapPin size={32} className="mx-auto mb-2 opacity-30" />
            <p>{t('locations.noLocations')}</p>
          </div>
        ) : (
          locations.map(loc => {
            const isMe = loc.id === appUser?.email;
            const dist = myLoc ? getDistance(myLoc.lat, myLoc.lng, loc.lat, loc.lng) : null;
            const isOnline = Date.now() - loc.updatedAt < 5 * 60 * 1000;
            return (
              <div key={loc.id} className={`card p-4 flex items-center gap-4 ${isMe ? 'border-brand-300 dark:border-brand-700' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0 ${isMe ? 'gradient-brand' : 'bg-slate-400 dark:bg-slate-600'}`}>
                  {loc?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">{loc.name} {isMe && <span className="text-xs text-brand-500">(You)</span>}</p>
                  <p className="text-xs text-slate-500 truncate">{loc.address || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className={`flex items-center gap-1 text-xs font-medium ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {isOnline ? t('locations.online') : timeSince(loc.updatedAt)}
                  </div>
                  {dist !== null && (
                    <p className="text-xs text-slate-400 mt-0.5">{dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
