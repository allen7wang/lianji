// Platforms without a health store (web). iOS and Android use health.ios.ts / health.android.ts.
export type HealthWorkout = { name: string; startedAt: string; endedAt: string; volumeKg: number; completedSets: number };
export type HealthBodyEntry = { recordedAt: string; weight: number; bodyFat: number | null };

export const healthStoreName: string | null = null;

export async function isHealthAvailable() {
  return false;
}

export async function requestHealthAccess() {
  return false;
}

export async function saveHealthWorkout(_workout: HealthWorkout) {}

export async function saveHealthBodyEntry(_entry: HealthBodyEntry) {}
