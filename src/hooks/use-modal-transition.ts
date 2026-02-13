import { useCallback, useEffect, useRef, useState } from 'react';

type TransitionOptions = {
  durationMs?: number;
};

export function useModalTransition<T>(options?: TransitionOptions) {
  const durationMs = options?.durationMs ?? 170;
  const [activeModal, setActiveModal] = useState<T | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const closeModal = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveModal(null);
  }, []);

  const openModal = useCallback(
    (nextModal: T) => {
      setActiveModal((current) => {
        if (!current) {
          return nextModal;
        }

        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
          setActiveModal(nextModal);
          timeoutRef.current = null;
        }, durationMs);

        return null;
      });
    },
    [durationMs],
  );

  return {
    activeModal,
    openModal,
    closeModal,
  };
}
