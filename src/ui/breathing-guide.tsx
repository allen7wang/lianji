import { useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { breathingElapsedMs, breathingPhaseAt, breathingRhythmLabel, newBreathingSession, pauseBreathingSession, resumeBreathingSession, type BreathingProfile } from '@/lib/breathing';
import { Button, IconButton, ProgressTrack, Txt } from './components';
import { makeStyles, space } from './theme';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export type BreathGuideRequest = { profile: BreathingProfile; seconds: number };
export function BreathingGuideModal({ request, onClose }: { request: BreathGuideRequest | null; onClose: () => void }) {
  const s = useStyles();
  return <Modal visible={request !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {request ? <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Txt variant="overline" tone="muted" style={{ flex: 1 }}>呼吸引导</Txt>
        <IconButton icon="close" label="关闭呼吸引导" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <BreathingGuide key={`${request.profile.id}:${request.seconds}`} profile={request.profile} seconds={request.seconds} />
      </ScrollView>
      <View style={s.footer}><Button label="关闭引导" variant="secondary" onPress={onClose} /></View>
    </SafeAreaView> : null}
  </Modal>;
}

export function BreathingGuide({ profile, seconds }: BreathGuideRequest) {
  const s = useStyles();
  const reducedMotion = useReducedMotion();
  const [session, setSession] = useState(newBreathingSession);
  const [clock, setClock] = useState(0);
  const elapsed = Math.min(seconds, breathingElapsedMs(session, clock) / 1000);
  const finished = elapsed >= seconds;
  const running = session.startedAt !== null && !finished;
  const phase = breathingPhaseAt(profile, elapsed);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(interval);
  }, [running]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        const now = Date.now();
        setClock(now);
        setSession(current => pauseBreathingSession(current, now));
      }
    });
    return () => subscription.remove();
  }, []);
  const toggle = () => {
    const now = Date.now();
    setClock(now);
    setSession(current => running ? pauseBreathingSession(current, now) : resumeBreathingSession(current, now));
  };
  const remaining = Math.max(0, Math.ceil(seconds - elapsed));
  const phaseLabel = finished ? '引导完成' : running ? phase.label : session.elapsedMs > 0 ? '已暂停' : '准备开始';
  return <View style={s.guide}>
    <View style={{ gap: space.xs }}>
      <Txt variant="title1" accessibilityRole="header">{profile.name}</Txt>
      <Txt variant="bodyStrong" tone="muted">{breathingRhythmLabel(profile)}</Txt>
    </View>
    <View style={s.animation}>
      <View accessible={false} style={[s.halo, (running || finished) && s.haloLive]} />
      <View accessible={false} style={[s.circle, running && s.circleLive, finished && s.circleDone, { transform: [{ scale: reducedMotion !== false ? 0.8 : finished ? 0.6 : phase.scale }] }]} />
      <View style={s.cue} accessible accessibilityLiveRegion="polite" accessibilityLabel={finished ? '引导完成' : running ? `${phase.label}，${phase.secondsRemaining} 秒` : phaseLabel}>
        <Txt variant="title2">{phaseLabel}</Txt>
        <Txt variant="display" tone={finished ? 'success' : running ? 'accent' : 'faint'}>{finished ? '✓' : running ? phase.secondsRemaining : '—'}</Txt>
      </View>
    </View>
    <View style={{ gap: space.sm }}>
      <ProgressTrack value={elapsed / seconds} tone={finished ? 'success' : 'accent'} />
      <Txt variant="caption" tone="muted" style={s.remaining}>剩余 {remaining} 秒 · 已完成 {phase.completedCycles} 个循环</Txt>
    </View>
    {finished ? <Txt variant="body" tone="success">引导结束，请关闭后按实际完成情况勾选本组。</Txt> : <Button label={running ? '暂停引导' : session.elapsedMs > 0 ? '继续引导' : '开始引导'} icon={running ? 'pause' : 'play'} onPress={toggle} />}
    <Button label="重新开始" icon="refresh-outline" variant="secondary" onPress={() => { setSession(newBreathingSession()); setClock(0); }} />
    <Txt variant="body">{profile.instruction}</Txt>
    <Txt variant="caption" tone="muted">按舒适节奏轻柔呼吸。头晕或胸闷时停止，恢复自然呼吸。切到后台会暂停引导。</Txt>
  </View>;
}

const SIZE = 220;

const useStyles = makeStyles(c => ({
  screen: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: space.page, paddingTop: space.lg, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md },
  footer: { paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: c.border },
  content: { paddingHorizontal: space.page, paddingTop: space.sm, paddingBottom: space.xxxl },
  guide: { gap: space.lg },
  animation: { height: SIZE + 24, justifyContent: 'center', alignItems: 'center' },
  halo: { position: 'absolute', width: SIZE + 20, height: SIZE + 20, borderRadius: (SIZE + 20) / 2, borderWidth: 1, borderColor: c.border },
  haloLive: { borderColor: c.accentSoft },
  circle: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: c.surfaceAlt, borderWidth: 3, borderColor: c.border },
  circleLive: { backgroundColor: c.accentSoft, borderColor: c.accent },
  circleDone: { backgroundColor: c.successSoft, borderColor: c.success },
  cue: { position: 'absolute', alignItems: 'center', gap: space.xs },
  remaining: { textAlign: 'center', fontVariant: ['tabular-nums'] },
}));
