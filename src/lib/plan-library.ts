import type { Plan, PlanDraftItem, PlanItem } from './types';

export function prioritizePlans(plans: Plan[], favoritePlanIds: readonly string[]) {
  const favorites = new Set(favoritePlanIds);
  return [...plans.filter(plan => favorites.has(plan.id)), ...plans.filter(plan => !favorites.has(plan.id))];
}

export function availablePlanName(baseName: string, plans: Pick<Plan, 'name'>[]) {
  const names = new Set(plans.map(plan => plan.name));
  let name = baseName;
  for (let suffix = 2; names.has(name); suffix++) name = `${baseName}（${suffix}）`;
  return name;
}

export function draftPlanCopy(source: Plan, planItems: PlanItem[], plans: Plan[]) {
  const items: PlanDraftItem[] = planItems.filter(item => item.planId === source.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => ({
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      weight: item.weight,
      unit: item.unit ?? 'reps',
      restSeconds: item.restSeconds ?? 90,
    }));
  return { name: availablePlanName(`${source.name} · 副本`, plans), note: source.note, items };
}
