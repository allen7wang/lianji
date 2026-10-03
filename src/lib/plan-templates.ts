import catalog from '../../assets/plans/training-programs.json';
import type { Exercise, PlanDraftItem } from './types';

export type ProgramDay = {
  id: string;
  name: string;
  focus: string;
  exercises: { name: string; sets: number; reps: number }[];
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
  days: ProgramDay[];
};

export const trainingPrograms: TrainingProgram[] = catalog;
export const programCategories = ['全部', ...new Set(trainingPrograms.map(program => program.category))];
export const templatePlanId = (programId: string, dayId: string) => `template:${programId}:${dayId}`;

export function templateDrafts(program: TrainingProgram, exercises: Exercise[]) {
  return program.days.map(day => ({
    id: templatePlanId(program.id, day.id),
    name: `${program.name} · ${day.name}`,
    note: `${day.focus}。${program.frequency} ${program.guidance.at(-1)} 平板支撑按秒、单侧动作按每侧记次数。 重量请按实际填写。`,
    items: day.exercises.map(item => {
      const exercise = exercises.find(entry => !entry.isCustom && entry.name === item.name);
      if (!exercise) throw new Error(`动作库缺少“${item.name}”，未添加这套计划。`);
      return { exerciseId: exercise.id, sets: item.sets, reps: item.reps, weight: 0 } satisfies PlanDraftItem;
    }),
  }));
}
