/**
 * Store tests — Zustand: useTripStore & useAuthStore
 * No Firebase calls needed; tests pure store logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTripStore } from '@/store/useTripStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { TripProfile } from '@/store/useTripStore';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockProfile: TripProfile = {
  id: 'trip_test_01',
  name: 'Iceland 2026',
  destinations: ['Reykjavik', 'Akureyri'],
  startDate: '2026-07-15',
  endDate: '2026-07-25',
  participants: [{ email: 'admin@test.com', name: 'Admin', role: 'admin' }],
  budget: 10000,
  currency: 'USD',
  pace: 'moderate',
  preferences: 'Family, kosher food, waterfalls',
  phase: 'pre',
};

// ── useTripStore ──────────────────────────────────────────────────────────────

describe('useTripStore', () => {
  beforeEach(() => {
    useTripStore.setState({
      currentTripId: null,
      tripProfile: null,
      days: [],
      offlineQueue: [],
      isOnline: true,
    });
  });

  it('sets and clears currentTripId', () => {
    useTripStore.getState().setCurrentTrip('trip_abc');
    expect(useTripStore.getState().currentTripId).toBe('trip_abc');
    useTripStore.getState().setCurrentTrip(null);
    expect(useTripStore.getState().currentTripId).toBeNull();
  });

  it('sets trip profile', () => {
    useTripStore.getState().setTripProfile(mockProfile);
    expect(useTripStore.getState().tripProfile?.name).toBe('Iceland 2026');
    expect(useTripStore.getState().tripProfile?.destinations).toContain('Reykjavik');
  });

  it('detects pre-trip phase correctly', () => {
    useTripStore.getState().setTripProfile({
      ...mockProfile,
      startDate: '2099-01-01',
      endDate: '2099-01-15',
    });
    expect(useTripStore.getState().getTripPhase()).toBe('pre');
  });

  it('detects post-trip phase correctly', () => {
    useTripStore.getState().setTripProfile({
      ...mockProfile,
      startDate: '2000-01-01',
      endDate: '2000-01-15',
    });
    expect(useTripStore.getState().getTripPhase()).toBe('post');
  });

  it('returns pre when no profile set', () => {
    expect(useTripStore.getState().getTripPhase()).toBe('pre');
  });

  it('enqueues offline mutations with unique IDs', () => {
    const { enqueueOfflineMutation, offlineQueue } = useTripStore.getState();
    enqueueOfflineMutation({ collection: 'itinerary', docId: 'day1', operation: 'update', payload: { text: 'test' } });
    enqueueOfflineMutation({ collection: 'expenses', docId: 'exp1', operation: 'set', payload: { amount: 42 } });
    const q = useTripStore.getState().offlineQueue;
    expect(q).toHaveLength(2);
    expect(q[0].id).not.toBe(q[1].id);
    expect(q[0].collection).toBe('itinerary');
    expect(q[1].collection).toBe('expenses');
  });

  it('dequeues specific offline mutation by ID', () => {
    useTripStore.getState().enqueueOfflineMutation({ collection: 'tasks', docId: 't1', operation: 'set' });
    const queue = useTripStore.getState().offlineQueue;
    const targetId = queue[0].id;
    useTripStore.getState().dequeueOfflineMutation(targetId);
    expect(useTripStore.getState().offlineQueue).toHaveLength(0);
  });

  it('clears entire offline queue', () => {
    useTripStore.getState().enqueueOfflineMutation({ collection: 'tasks', docId: 't1', operation: 'set' });
    useTripStore.getState().enqueueOfflineMutation({ collection: 'tasks', docId: 't2', operation: 'update' });
    useTripStore.getState().clearOfflineQueue();
    expect(useTripStore.getState().offlineQueue).toHaveLength(0);
  });

  it('tracks online/offline state', () => {
    useTripStore.getState().setOnline(false);
    expect(useTripStore.getState().isOnline).toBe(false);
    useTripStore.getState().setOnline(true);
    expect(useTripStore.getState().isOnline).toBe(true);
  });

  it('sets days array', () => {
    useTripStore.getState().setDays([
      { docId: 'd1', id: 'day_1', title: 'Day 1', date: '15.07', isoDate: '2026-07-15', order: 1, items: [] },
    ]);
    expect(useTripStore.getState().days).toHaveLength(1);
    expect(useTripStore.getState().days[0].title).toBe('Day 1');
  });
});

// ── useAuthStore ──────────────────────────────────────────────────────────────

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      firebaseUser: null,
      appUser: null,
      authLoading: true,
      loginError: null,
      isDarkMode: true,
      language: 'he',
    });
  });

  it('sets auth loading state', () => {
    useAuthStore.getState().setAuthLoading(false);
    expect(useAuthStore.getState().authLoading).toBe(false);
  });

  it('sets and clears login error', () => {
    useAuthStore.getState().setLoginError('Invalid credentials');
    expect(useAuthStore.getState().loginError).toBe('Invalid credentials');
    useAuthStore.getState().setLoginError(null);
    expect(useAuthStore.getState().loginError).toBeNull();
  });

  it('sets app user', () => {
    useAuthStore.getState().setAppUser({ email: 'x@y.com', name: 'Test', role: 'editor' });
    expect(useAuthStore.getState().appUser?.role).toBe('editor');
  });

  it('clears app user on sign-out', () => {
    useAuthStore.getState().setAppUser({ email: 'x@y.com', name: 'Test', role: 'admin' });
    useAuthStore.getState().setAppUser(null);
    expect(useAuthStore.getState().appUser).toBeNull();
  });

  it('toggles dark mode', () => {
    const initial = useAuthStore.getState().isDarkMode;
    useAuthStore.getState().toggleDarkMode();
    expect(useAuthStore.getState().isDarkMode).toBe(!initial);
  });

  it('changes language', () => {
    useAuthStore.getState().setLanguage('en');
    expect(useAuthStore.getState().language).toBe('en');
    useAuthStore.getState().setLanguage('he');
    expect(useAuthStore.getState().language).toBe('he');
  });

  it('defaults to Hebrew language', () => {
    // Fresh reset
    useAuthStore.setState({ language: 'he' });
    expect(useAuthStore.getState().language).toBe('he');
  });
});
