import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Wall-clock time that refreshes on an interval while enabled. Keep it in the smallest component that shows it. */
export function useNow(enabled = true, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(handle); subscription.remove(); };
  }, [enabled, intervalMs]);
  return now;
}
