import catalog from '../../assets/plans/training-programs.json';
import type { Exercise, PlanDraftItem, TrainingUnit } from './types';
import { defaultUnit } from './training-target';

export type ProgramDay = {
  id: string;
  name: string;
  focus: string;
  exercises: { name: string; sets: number; reps: number; unit?: TrainingUnit; restSeconds?: number }[];
};
export type TrainingProgram = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: string;
  level: string;
  frequency: string;
  equipment: string[];
  guidance: string[];
  sport?: string;
  days: ProgramDay[];
};

export const trainingPrograms = catalog as TrainingProgram[];
export const programCategories = ['全部', ...new Set(trainingPrograms.map(program => program.category))];
export const programSports = ['全部项目', ...new Set(trainingPrograms.flatMap(program => program.sport ? [program.sport] : []))];
export const templatePlanId = (programId: string, dayId: string) => `template:${programId}:${dayId}`;

export function templateDrafts(program: TrainingProgram, exercises: Exercise[]) {
  return program.days.map(day => ({
    id: templatePlanId(program.id, day.id),
    name: `${program.name} · ${day.name}`,
    note: `${day.focus}。${program.frequency} ${program.guidance.join(' ')}${program.category === '呼吸训练' ? '' : ' 单侧动作按每侧记录。重量请按实际填写。'}`,
    items: day.exercises.map(item => {
      const exercise = exercises.find(entry => !entry.isCustom && entry.name === item.name);
      if (!exercise) throw new Error(`动作库缺少“${item.name}”，未添加这套计划。`);
      return { exerciseId: exercise.id, sets: item.sets, reps: item.reps, weight: 0, unit: item.unit ?? defaultUnit(exercise), restSeconds: item.restSeconds ?? 90 } satisfies PlanDraftItem;
    }),
  }));
}
