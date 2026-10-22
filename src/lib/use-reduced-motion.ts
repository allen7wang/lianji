import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// null keeps animations still until the platform preference is known.
export function useReducedMotion(onChange?: (reduced: boolean) => void) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    let receivedChange = false;
    const update = (value: boolean) => {
      if (!mounted) return;
      setReduced(value);
      onChange?.(value);
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      receivedChange = true;
      update(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (!receivedChange) update(value);
    }).catch(() => {
      if (!receivedChange) update(true);
    });
    return () => { mounted = false; subscription.remove(); };
  }, [onChange]);
  return reduced;
}
