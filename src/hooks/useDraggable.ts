import { useState, useEffect, RefObject } from 'react';

export function useDraggable(handleRef: RefObject<HTMLElement | null>, modalRef: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleElement = handleRef.current;
    const modalElement = modalRef.current;
    if (!handleElement || !modalElement) return;

    const onMouseDown = (e: MouseEvent | TouchEvent) => {
      // Don't drag if clicking a button
      if ((e.target as HTMLElement).closest('button')) return;
      
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setPosition(prev => {
        setDragStart({
          x: clientX - prev.x,
          y: clientY - prev.y
        });
        return prev;
      });
    };

    const onMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setPosition({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    handleElement.addEventListener('mousedown', onMouseDown);
    handleElement.addEventListener('touchstart', onMouseDown, { passive: false });
    
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove, { passive: false });
      window.addEventListener('touchmove', onMouseMove, { passive: false });
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchend', onMouseUp);
    }

    return () => {
      handleElement.removeEventListener('mousedown', onMouseDown);
      handleElement.removeEventListener('touchstart', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [isDragging, dragStart, handleRef, modalRef]);

  return position;
}
