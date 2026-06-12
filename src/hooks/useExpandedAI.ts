import { useState, useEffect } from 'react';
import { useTripStore } from '@/store/useTripStore';

export function useExpandedAI() {
  const currentTripId = useTripStore(s => s.currentTripId);
  const [expandedAIs, setExpandedAIs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentTripId) return;
    try {
      const saved = localStorage.getItem(`expandedAi_${currentTripId}`);
      if (saved) {
        setExpandedAIs(JSON.parse(saved));
      } else {
        setExpandedAIs({});
      }
    } catch (e) {
      console.error('Failed to load expanded AI state', e);
    }
  }, [currentTripId]);

  const toggleExpand = (id: string) => {
    setExpandedAIs(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (currentTripId) {
        localStorage.setItem(`expandedAi_${currentTripId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const expandAll = (ids: string[]) => {
    setExpandedAIs(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = true; });
      if (currentTripId) {
        localStorage.setItem(`expandedAi_${currentTripId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const collapseAll = (ids: string[]) => {
    setExpandedAIs(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = false; });
      if (currentTripId) {
        localStorage.setItem(`expandedAi_${currentTripId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  return { expandedAIs, toggleExpand, expandAll, collapseAll };
}
