import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { readDeviceValue, writeDeviceValue } from './database';
import { useActiveWorkout, useLibrary } from './data';
import { haptic } from './feedback';
import { cancelTimerNotification, scheduleTimerNotification } from './notifications';

export type TimerKind = 'rest' | 'exercise';

export type WorkoutTimer = {
  kind: TimerKind;
  label: string;
  workoutId: string;
  exerciseId: string;
  startedAt: number;
  deadline: number;
  notificationId: string | null;
};

type TimerApi = {
  timer: WorkoutTimer | null;
  start: (kind: TimerKind, seconds: number, workoutId: string, exerciseId: string, label: string) => void;
  extend: (seconds: number) => void;
  stop: () => void;
};

const TimerContext = createContext<TimerApi | null>(null);
const STORAGE_KEY = 'activeTimer';
// A finished timer is still worth showing briefly after the app comes back.
const STALE_AFTER_MS = 10 * 60 * 1000;

const alertCopy = (timer: Pick<WorkoutTimer, 'kind' | 'label'>) => timer.kind === 'rest'
  ? { title: '休息结束', body: `可以开始下一组了 · ${timer.label}` }
  : { title: '计时结束', body: `${timer.label}：按实际完成情况勾选这一组` };

/** Rest and exercise countdowns that survive leaving the workout screen and restarting the app. */
export function WorkoutTimerProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { ready, deviceSettings } = useLibrary();
  const { workout } = useActiveWorkout();
  const [timer, setTimer] = useState<WorkoutTimer | null>(null);
  const settings = useRef(deviceSettings);
  useEffect(() => { settings.current = deviceSettings; }, [deviceSettings]);
  const current = useRef<WorkoutTimer | null>(null);
  const loaded = useRef(false);

  const commit = useCallback((next: WorkoutTimer | null) => {
    const previous = current.current;
    current.current = next;
    setTimer(next);
    if (previous?.notificationId && previous.notificationId !== next?.notificationId) void cancelTimerNotification(previous.notificationId);
    void writeDeviceValue(db, STORAGE_KEY, next).catch(() => {});
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    readDeviceValue<WorkoutTimer>(db, STORAGE_KEY).then(saved => {
      if (cancelled) return;
      loaded.current = true;
      if (saved && typeof saved.deadline === 'number' && saved.deadline > Date.now() - STALE_AFTER_MS) {
        current.current = saved;
        setTimer(saved);
      } else if (saved) {
        void writeDeviceValue(db, STORAGE_KEY, null);
      }
    }).catch(() => { loaded.current = true; });
    return () => { cancelled = true; };
  }, [db]);

  // A timer belongs to one workout; finishing or discarding it clears the countdown.
  useEffect(() => {
    if (ready && loaded.current && timer && timer.workoutId !== workout?.id) commit(null);
  }, [ready, workout?.id, timer, commit]);

  // Buzz when the countdown ends while the app is open; the scheduled notification covers the background.
  useEffect(() => {
    if (!timer) return;
    const remaining = timer.deadline - Date.now();
    if (remaining <= 0) return;
    const handle = setTimeout(() => {
      if (AppState.currentState === 'active') haptic.success(settings.current.haptics);
    }, remaining);
    return () => clearTimeout(handle);
  }, [timer]);

  const schedule = useCallback((next: WorkoutTimer) => {
    if (!settings.current.restNotifications) return;
    const seconds = Math.round((next.deadline - Date.now()) / 1000);
    const copy = alertCopy(next);
    scheduleTimerNotification(seconds, copy.title, copy.body).then(notificationId => {
      if (!notificationId) return;
      // The user may have stopped or replaced this timer while scheduling.
      if (settings.current.restNotifications && current.current?.startedAt === next.startedAt && current.current.deadline === next.deadline) commit({ ...next, notificationId });
      else void cancelTimerNotification(notificationId);
    }).catch(() => {});
  }, [commit]);

  useEffect(() => {
    const active = current.current;
    if (!ready || !active) return;
    if (!deviceSettings.restNotifications && active.notificationId) {
      commit({ ...active, notificationId: null });
    }
  }, [ready, deviceSettings.restNotifications, timer, commit]);

  const api = useMemo<TimerApi>(() => ({
    timer,
    start(kind, seconds, workoutId, exerciseId, label) {
      if (!(seconds > 0)) { commit(null); return; }
      const now = Date.now();
      const next: WorkoutTimer = { kind, label, workoutId, exerciseId, startedAt: now, deadline: now + seconds * 1000, notificationId: null };
      commit(next);
      schedule(next);
    },
    extend(seconds) {
      const active = current.current;
      if (!active) return;
      const next = { ...active, deadline: Math.max(active.deadline, Date.now()) + seconds * 1000, notificationId: null };
      commit(next);
      schedule(next);
    },
    stop() { commit(null); },
  }), [timer, commit, schedule]);

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>;
}

export function useWorkoutTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useWorkoutTimer must be used inside WorkoutTimerProvider');
  return context;
}
