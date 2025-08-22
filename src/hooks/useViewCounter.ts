import { useEffect, useRef, useState } from 'react';
import { db } from '../config/firebase';
import { doc, increment, updateDoc } from 'firebase/firestore';

export function useViewCounter(mediaId: string, targetEl: HTMLElement | null) {
  const [counted, setCounted] = useState(false);
  const io = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!targetEl || counted) return;
    io.current = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      if (e.intersectionRatio >= 0.5) {
        setCounted(true);
        updateDoc(doc(db, 'media', mediaId), { viewsCount: increment(1) }).catch(() => {});
      }
    }, { threshold: [0, 0.5, 1]});
    io.current.observe(targetEl);
    return () => io.current?.disconnect();
  }, [mediaId, targetEl, counted]);
}