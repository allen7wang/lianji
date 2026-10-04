import { useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { breathingElapsedMs, breathingPhaseAt, breathingRhythmLabel, newBreathingSession, pauseBreathingSession, resumeBreathingSession, type BreathingProfile } from '@/lib/breathing';
import { Button, IconButton } from './components';
import { C } from './theme';

export type BreathGuideRequest = { profile: BreathingProfile; seconds: number };
export function BreathingGuideModal({ request, onClose }: { request: BreathGuideRequest | null; onClose: () => void }) {
  return <Modal visible={request !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {request ? <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}><Text style={styles.eyebrow}>呼吸引导</Text><IconButton icon="close" onPress={onClose} /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <BreathingGuide key={`${request.profile.id}:${request.seconds}`} profile={request.profile} seconds={request.seconds} />
      </ScrollView>
      <View style={styles.footer}><Button label="关闭引导" variant="secondary" onPress={onClose} /></View>
    </SafeAreaView> : null}
  </Modal>;
}

export function BreathingGuide({ profile, seconds }: BreathGuideRequest) {
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
  return <View style={styles.guide}>
    <Text style={styles.title}>{profile.name}</Text>
    <Text style={styles.rhythm}>{breathingRhythmLabel(profile)}</Text>
    <View style={styles.animation}>
      <View accessible={false} style={[styles.circle, { transform: [{ scale: finished ? 0.6 : phase.scale }] }]} />
      <View style={styles.cue}><Text style={styles.phase}>{finished ? '引导完成' : running ? phase.label : session.elapsedMs > 0 ? '已暂停' : '准备开始'}</Text>
        <Text style={styles.count}>{finished ? '✓' : running ? phase.secondsRemaining : '—'}</Text></View>
    </View>
    <Text style={styles.remaining}>剩余 {remaining} 秒 · 已完成 {phase.completedCycles} 个循环</Text>
    {finished ? <Text style={styles.complete}>引导结束，请关闭后按实际完成情况勾选本组。</Text> : <Button label={running ? '暂停引导' : session.elapsedMs > 0 ? '继续引导' : '开始引导'} icon={running ? 'pause-outline' : 'play-outline'} onPress={toggle} />}
    <Button label="重新开始" icon="refresh-outline" variant="secondary" onPress={() => { setSession(newBreathingSession()); setClock(0); }} />
    <Text style={styles.caption}>{profile.instruction}</Text>
    <Text style={styles.hint}>按舒适节奏轻柔呼吸。头晕或胸闷时停止，恢复自然呼吸。切到后台会暂停引导。</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: C.line },
  eyebrow: { color: C.accent, fontWeight: '800', fontSize: 13 }, content: { padding: 20, gap: 16 }, guide: { gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: C.text }, rhythm: { color: C.accent, fontSize: 14, lineHeight: 22 },
  animation: { height: 240, justifyContent: 'center', alignItems: 'center' }, circle: { width: 220, height: 220, borderRadius: 110, backgroundColor: C.accentDark, borderWidth: 3, borderColor: C.accent },
  cue: { position: 'absolute', alignItems: 'center', gap: 8 }, phase: { fontSize: 22, color: C.text, fontWeight: '800' }, count: { fontSize: 42, fontWeight: '800', color: C.accent },
  remaining: { color: C.muted, textAlign: 'center' }, caption: { color: C.text, fontSize: 14, lineHeight: 22 }, hint: { color: C.muted, fontSize: 12, lineHeight: 20 }, complete: { color: C.accent, lineHeight: 22 },
});
