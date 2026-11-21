import type { Permission } from 'react-native-health-connect';
import type { HealthBodyEntry, HealthWorkout } from './health';

export const healthStoreName = 'Health Connect';

const writeTypes = ['ExerciseSession', 'Weight', 'BodyFat'] as const;
const permissions: Permission[] = writeTypes.map(recordType => ({ accessType: 'write', recordType }));

async function availableStore() {
  try {
    const health = await import('react-native-health-connect');
    if (await health.getSdkStatus() !== health.SdkAvailabilityStatus.SDK_AVAILABLE) return null;
    return await health.initialize() ? health : null;
  } catch {
    return null;
  }
}

export async function isHealthAvailable() {
  return (await availableStore()) !== null;
}

function canWrite(granted: readonly { accessType: string; recordType: string }[], type: typeof writeTypes[number]) {
  return granted.some(permission => permission.accessType === 'write' && permission.recordType === type);
}

export async function requestHealthAccess() {
  const health = await availableStore();
  if (!health) return false;
  const granted = await health.requestPermission(permissions);
  return writeTypes.some(type => canWrite(granted, type));
}

export async function saveHealthWorkout(workout: HealthWorkout) {
  const health = await availableStore();
  if (!health || !canWrite(await health.getGrantedPermissions(), 'ExerciseSession')) return;
  if (Date.parse(workout.endedAt) <= Date.parse(workout.startedAt)) return;
  await health.insertRecords([{
    recordType: 'ExerciseSession',
    exerciseType: health.ExerciseType.STRENGTH_TRAINING,
    startTime: workout.startedAt,
    endTime: workout.endedAt,
    title: workout.name,
  }]);
}

export async function saveHealthBodyEntry(entry: HealthBodyEntry) {
  const health = await availableStore();
  if (!health) return;
  const granted = await health.getGrantedPermissions();
  // The native module accepts only one record type per call.
  const writes: ReturnType<typeof health.insertRecords>[] = [];
  if (canWrite(granted, 'Weight')) {
    writes.push(health.insertRecords([{ recordType: 'Weight', time: entry.recordedAt, weight: { value: entry.weight, unit: 'kilograms' } }]));
  }
  if (entry.bodyFat !== null && canWrite(granted, 'BodyFat')) {
    writes.push(health.insertRecords([{ recordType: 'BodyFat', time: entry.recordedAt, percentage: entry.bodyFat }]));
  }
  await Promise.all(writes);
}
