import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { clockLabel } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { useWorkoutTimer } from '@/lib/workout-timer';
import { Button, Card, ProgressTrack, Txt } from './components';
import { makeStyles, space, useTheme } from './theme';

/** Live rest / exercise countdown. Only this component re-renders every second. */
export function RestTimerCard() {
  const { timer, extend, stop } = useWorkoutTimer();
  const now = useNow(!!timer, 500);
  const s = useStyles();
  const { c } = useTheme();
  if (!timer) return null;
  const total = Math.max(1, timer.deadline - timer.startedAt);
  const remainingMs = Math.max(0, timer.deadline - now);
  const remaining = Math.ceil(remainingMs / 1000);
  const finished = remaining <= 0;
  const rest = timer.kind === 'rest';
  const title = finished ? (rest ? '休息结束，开始下一组' : '计时结束，按实际完成情况勾选') : rest ? '组间休息' : '动作计时';

  return <Card variant="signal" style={s.card}>
    <View style={s.top}>
      <View style={s.label}>
        <Ionicons name={finished ? 'notifications' : 'timer-outline'} size={16} color={c.onAccent} />
        <Txt variant="overline" tone="onAccent">{title}</Txt>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={finished ? '关闭计时' : '停止计时'} hitSlop={12} onPress={stop}>
        <Ionicons name="close" size={20} color={c.onAccent} />
      </Pressable>
    </View>
    <View style={s.middle}>
      <Txt variant="display" tone="onAccent" accessibilityRole="text" accessibilityLiveRegion={finished ? 'assertive' : undefined}>{finished ? '0:00' : clockLabel(remaining)}</Txt>
      <Txt variant="caption" tone="onAccent" numberOfLines={1} style={s.subject}>{timer.label}</Txt>
    </View>
    <ProgressTrack value={finished ? 1 : 1 - remainingMs / total} tone="onAccent" />
    <View style={s.actions}>
      <Button label="+15 秒" icon="add" size="sm" variant="onSignal" onPress={() => extend(15)} style={{ flex: 1 }} />
      <Button label={finished ? '好的' : '跳过'} icon={finished ? 'checkmark' : 'play-skip-forward'} size="sm" variant="inverse" onPress={stop} style={{ flex: 1 }} />
    </View>
  </Card>;
}

const useStyles = makeStyles(() => ({
  card: { gap: space.md, padding: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  middle: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  subject: { flex: 1, opacity: 0.75 },
  actions: { flexDirection: 'row', gap: space.sm },
}));
