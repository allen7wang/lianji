import catalog from '../../assets/exercises/breathing-profiles.json';
import type { Exercise } from './types';

export type BreathingProfile = typeof catalog[number];
export type BreathPhase = { label: string; seconds: number; fromScale: number; toScale: number };
export const breathingProfiles: BreathingProfile[] = catalog;
export const breathingProfileFor = (exercise?: Pick<Exercise, 'name' | 'isCustom'>) =>
  exercise && !exercise.isCustom ? breathingProfiles.find(profile => profile.name === exercise.name) : undefined;

export function breathingPhases(profile: BreathingProfile): BreathPhase[] {
  return [
    { label: '吸气', seconds: profile.inhaleSeconds, fromScale: 0.6, toScale: 1 },
    { label: '吸后停留', seconds: profile.holdInSeconds, fromScale: 1, toScale: 1 },
    { label: '呼气', seconds: profile.exhaleSeconds, fromScale: 1, toScale: 0.6 },
    { label: '呼后停留', seconds: profile.holdOutSeconds, fromScale: 0.6, toScale: 0.6 },
  ].filter(phase => phase.seconds > 0);
}

export function breathingPhaseAt(profile: BreathingProfile, elapsedSeconds: number) {
  const phases = breathingPhases(profile);
  const cycleSeconds = phases.reduce((sum, phase) => sum + phase.seconds, 0);
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  let position = elapsed % cycleSeconds;
  for (const phase of phases) {
    if (position < phase.seconds) return {
      label: phase.label,
      secondsRemaining: Math.ceil(phase.seconds - position),
      scale: phase.fromScale + (phase.toScale - phase.fromScale) * position / phase.seconds,
      completedCycles: Math.floor(elapsed / cycleSeconds),
    };
    position -= phase.seconds;
  }
  throw new Error('呼吸节奏未配置');
}

export const breathingRhythmLabel = (profile: BreathingProfile) => breathingPhases(profile)
  .map(phase => `${phase.label} ${phase.seconds} 秒`).join(' · ');

export type BreathingSession = { elapsedMs: number; startedAt: number | null };
export const newBreathingSession = (): BreathingSession => ({ elapsedMs: 0, startedAt: null });
export const breathingElapsedMs = (session: BreathingSession, now: number) =>
  session.elapsedMs + (session.startedAt === null ? 0 : Math.max(0, now - session.startedAt));
export const resumeBreathingSession = (session: BreathingSession, now: number): BreathingSession =>
  session.startedAt === null ? { ...session, startedAt: now } : session;
export const pauseBreathingSession = (session: BreathingSession, now: number): BreathingSession =>
  ({ elapsedMs: breathingElapsedMs(session, now), startedAt: null });
