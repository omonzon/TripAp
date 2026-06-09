import { useEffect } from 'react';

export function usePullToRefresh(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startY = 0;
    let isPulling = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Only enable pull to refresh if we are at the very top of the container
      if (el.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling) return;
      const y = e.touches[0].clientY;
      const pullDistance = y - startY;

      // If user pulls down more than 150px while at the top
      if (pullDistance > 150) {
        isPulling = false;
        // window.location.reload(); // Disabled to prevent accidental app reload when switching tabs/scrolling
      }
    };

    const handleTouchEnd = () => {
      isPulling = false;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref]);
}
