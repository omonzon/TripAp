/**
 * Trip store — Zustand with offline mutation queue
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';

export type TripPhase = 'pre' | 'mid' | 'post';

export interface TripProfile {
  id: string;
  name: string;
  destinations: string[];
  startDate: string;  // ISO
  endDate: string;    // ISO
  participants: Participant[];
  budget: number;
  currency: string;
  pace: 'relaxed' | 'moderate' | 'intense';
  preferences: string; // free text → semantic extraction
  photoAlbums?: string[];
  generatedMapUrl?: string;
  tripStyle?: string[]; // e.g. diving, trekking, food, etc.
  phase: TripPhase;
  createdBy?: string;
}

export interface Participant {
  email: string;
  name: string;
  nickname?: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface ItineraryDay {
  docId: string;
  id: string;
  title: string;
  date: string;
  isoDate: string;
  order: number;
  mapUrl?: string;
  mapImgUrl?: string;
  mapImage?: string;
  locationNameEn?: string;
  items: ItineraryItem[];
}

export interface ReferralLink {
  title: string;
  url: string;
  icon?: string;
}

export interface ItineraryItem {
  id: string;
  type: string;
  text: string;
  authorName?: string;
  fixed?: boolean;
  flightData?: FlightData;
  referrals?: ReferralLink[];
  aiRecommendation?: string;
  isSolving?: boolean;
  lat?: number;
  lng?: number;
  time?: string;
  locationNameEn?: string;
  completed?: boolean;
}

export interface FlightData {
  status?: string;
  terminal?: string;
  gate?: string;
  checkin?: string;
  time?: string;
}

export type OfflineMutation = {
  id: string;
  collection: string;
  docId: string;
  operation: 'set' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  timestamp: number;
};

export interface AvailableTrip {
  id: string;
  name: string;
  destinations: string[];
}

export interface TripDocument {
  id: string;
  title: string;
  content: string;
  link?: string;
  createdAt: number;
  updatedAt: number;
}

interface TripState {
  currentTripId: string | null;
  tripProfile: TripProfile | null;
  availableTrips: AvailableTrip[];
  days: ItineraryDay[];
  offlineQueue: OfflineMutation[];
  isOnline: boolean;

  setCurrentTrip: (tripId: string | null) => void;
  setTripProfile: (profile: TripProfile | null) => void;
  setAvailableTrips: (trips: AvailableTrip[]) => void;
  setDays: (days: ItineraryDay[]) => void;
  enqueueOfflineMutation: (mutation: Omit<OfflineMutation, 'id' | 'timestamp'>) => void;
  dequeueOfflineMutation: (id: string) => void;
  clearOfflineQueue: () => void;
  setOnline: (val: boolean) => void;
  getTripPhase: () => TripPhase;
}

export const useTripStore = create<TripState>()(
  persist(
    (set, get) => ({
      currentTripId: null,
      tripProfile: null,
      availableTrips: [],
      days: [],
      offlineQueue: [],
      isOnline: navigator.onLine,

      setCurrentTrip: (tripId) => set({ currentTripId: tripId }),
      setTripProfile: (profile) => set({ tripProfile: profile }),
      setAvailableTrips: (trips) => set({ availableTrips: trips }),
      setDays: (days) => set({ days }),

      enqueueOfflineMutation: (mutation) =>
        set((s) => ({
          offlineQueue: [
            ...s.offlineQueue,
            {
              ...mutation,
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              timestamp: Date.now(),
            },
          ],
        })),

      dequeueOfflineMutation: (id) =>
        set((s) => ({ offlineQueue: s.offlineQueue.filter((m) => m.id !== id) })),

      clearOfflineQueue: () => set({ offlineQueue: [] }),
      setOnline: (val) => set({ isOnline: val }),

      getTripPhase: (): TripPhase => {
        const profile = get().tripProfile;
        if (!profile) return 'pre';
        const now = new Date();
        const start = new Date(profile.startDate);
        const end = new Date(profile.endDate);
        if (now < start) return 'pre';
        if (now > end) return 'post';
        return 'mid';
      },
    }),
    {
      name: 'trip-store',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const useUserRole = () => {
  const appUser = useAuthStore(s => s.appUser);
  return appUser?.role || 'viewer';
};
