import extras from '../../assets/exercises/extra-exercises.json';
import type { Exercise, TrainingUnit } from './types';

type DefaultTarget = { name: string; recording?: string };
export function defaultUnit(exercise?: Pick<Exercise, 'name' | 'isCustom'>): TrainingUnit {
  if (!exercise || exercise.isCustom) return 'reps';
  return exercise.name === '平板支撑' || (extras as DefaultTarget[]).some(item => item.name === exercise.name && item.recording === 'seconds') ? 'seconds' : 'reps';
}

export function defaultSetTarget(exercise?: Pick<Exercise, 'name' | 'isCustom'>) {
  const unit = defaultUnit(exercise);
  return { weight: 0, reps: unit === 'seconds' ? 30 : 10, unit };
}
