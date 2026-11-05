import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useTrainingDate() {
  const [date, setDate] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = new Date();
      setDate(now);
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(update, midnight.getTime() - now.getTime());
    };
    update();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') update();
    });
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, []);

  return date;
}
