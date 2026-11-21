import type { HealthBodyEntry, HealthWorkout } from './health';

export const healthStoreName = 'Apple 健康';

const workoutType = 'HKWorkoutTypeIdentifier';
const massType = 'HKQuantityTypeIdentifierBodyMass';
const fatType = 'HKQuantityTypeIdentifierBodyFatPercentage';
const writeTypes = [workoutType, massType, fatType] as const;

export async function isHealthAvailable() {
  try {
    return (await import('@kingstinct/react-native-healthkit')).isHealthDataAvailable();
  } catch {
    return false;
  }
}

export async function requestHealthAccess() {
  if (!await isHealthAvailable()) return false;
  const health = await import('@kingstinct/react-native-healthkit');
  await health.requestAuthorization({ toShare: [...writeTypes] });
  return writeTypes.some(type => health.authorizationStatusFor(type) === health.AuthorizationStatus.sharingAuthorized);
}

export async function saveHealthWorkout(workout: HealthWorkout) {
  if (!await isHealthAvailable()) return;
  const health = await import('@kingstinct/react-native-healthkit');
  if (health.authorizationStatusFor(workoutType) !== health.AuthorizationStatus.sharingAuthorized) return;
  const start = new Date(workout.startedAt);
  const end = new Date(workout.endedAt);
  if (end <= start) return;
  await health.saveWorkoutSample(health.WorkoutActivityType.traditionalStrengthTraining, [], start, end, undefined, {
    HKWorkoutBrandName: workout.name,
  });
}

export async function saveHealthBodyEntry(entry: HealthBodyEntry) {
  if (!await isHealthAvailable()) return;
  const health = await import('@kingstinct/react-native-healthkit');
  const time = new Date(entry.recordedAt);
  const authorized = health.AuthorizationStatus.sharingAuthorized;
  await Promise.all([
    health.authorizationStatusFor(massType) === authorized
      ? health.saveQuantitySample(massType, 'kg', entry.weight, time, time)
      : undefined,
    entry.bodyFat !== null && health.authorizationStatusFor(fatType) === authorized
      ? health.saveQuantitySample(fatType, '%', entry.bodyFat / 100, time, time)
      : undefined,
  ]);
}
