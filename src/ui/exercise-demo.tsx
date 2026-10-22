import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { demoFor, demoMediaLabel, demoSource, guideFor, type ExerciseDemo, type ExerciseGuide } from '@/lib/exercise-demos';
import type { Exercise } from '@/lib/types';
import { Button, Card, Empty, IconButton } from './components';
import { C } from './theme';
import { breathingProfileFor } from '@/lib/breathing';
import { BreathingGuide } from './breathing-guide';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export function ExerciseDemoModal({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return <Modal visible={exercise !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {exercise ? <DemoContent key={exercise.id} exercise={exercise} onClose={onClose} /> : null}
  </Modal>;
}

function DemoContent({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const demo = demoFor(exercise);
  const guide = guideFor(exercise);
  const breathing = breathingProfileFor(exercise);
  const scrollRef = useRef<ScrollView>(null);
  const instructionsY = useRef(0);
  const reducedMotion = useReducedMotion();
  const showInstructions = () => scrollRef.current?.scrollTo({ y: Math.max(0, instructionsY.current - 12), animated: reducedMotion === false });
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}><Text style={styles.eyebrow}>动作演示</Text><IconButton icon="close" label="关闭动作演示" onPress={onClose} /></View>
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
      {!breathing ? <Text style={styles.title}>{exercise.name}</Text> : null}
      <View style={styles.metaRow}><Text style={styles.meta}>{exercise.muscle} · {exercise.equipment}</Text>{demo ? <Text style={styles.mediaBadge}>{demoMediaLabel(demo)}</Text> : null}</View>
      {breathing ? <BreathingGuide profile={breathing} seconds={breathing.id === 'box_breathing' ? 64 : 60} /> : demo ? <DemoPlayer demo={demo} onViewInstructions={guide ? showInstructions : undefined} /> : <Empty icon="videocam-outline" title="暂无动作动图" subtitle="自定义动作还没有配置演示素材" />}
      {guide ? <View onLayout={event => { instructionsY.current = event.nativeEvent.layout.y; }}><DemoInstructions guide={guide} /></View> : null}
      {demo ? <View style={styles.credit}>
        <Text style={styles.creditText}>素材：{demo.source}</Text>
        {demo.sourceUrl ? <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(demo.sourceUrl!).catch(console.error)}>查看来源</Text> : null}
        {demo.licenseUrl ? <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(demo.licenseUrl!).catch(console.error)}>{demo.license}</Text> : null}
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

function DemoInstructions({ guide }: { guide: ExerciseGuide }) {
  return <View style={styles.instructions}>
    <Card style={styles.instructions}>
      <Text style={styles.sectionTitle}>动作步骤</Text>
      {guide.steps.map((step, index) => <View key={step} style={styles.stepRow}><Text style={styles.stepIndex}>{index + 1}</Text><Text style={styles.stepText}>{step}</Text></View>)}
    </Card>
    <Card style={styles.instructions}>
      <Text style={styles.sectionTitle}>动作要点</Text>
      {guide.cues.map(cue => <Text key={cue} style={styles.tip}>• {cue}</Text>)}
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>常见错误</Text>
      {guide.mistakes.map(mistake => <Text key={mistake} style={styles.caption}>• {mistake}</Text>)}
    </Card>
    <Text style={styles.creditText}>演示仅供动作参考，不代表适合所有人的负重或幅度。不适时停止练习，先确保动作可控。</Text>
  </View>;
}

function DemoPlayer({ demo, onViewInstructions }: { demo: ExerciseDemo; onViewInstructions?: () => void }) {
  const imageRef = useRef<Image>(null);
  const [manualPlaying, setManualPlaying] = useState<boolean | null>(null);
  const pauseForReducedMotion = useCallback((reduced: boolean) => { if (reduced) setManualPlaying(false); }, []);
  const reducedMotion = useReducedMotion(pauseForReducedMotion);
  const playing = manualPlaying ?? reducedMotion === false;
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [load, setLoad] = useState<{ attempt: number; status: 'loading' | 'ready' | 'error' | 'timeout' }>({ attempt: 0, status: 'loading' });
  const { attempt, status } = load;
  const loaded = status === 'ready';
  const failed = status === 'error' || status === 'timeout';
  const settleLoad = useCallback((next: 'ready' | 'error' | 'timeout') => {
    // Ignore late callbacks from a timed-out or replaced native image request.
    setLoad(current => current.attempt === attempt && current.status === 'loading' ? { ...current, status: next } : current);
  }, [attempt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const operation = playing && active ? imageRef.current?.startAnimating() : imageRef.current?.stopAnimating();
    operation?.catch(console.error);
  }, [playing, active, loaded]);
  useEffect(() => {
    if (loaded || failed || !active || demo.asset) return;
    const timeout = setTimeout(() => settleLoad('timeout'), 20_000);
    return () => clearTimeout(timeout);
  }, [loaded, failed, active, demo.asset, settleLoad]);

  return <View style={styles.player}>
    <View style={[styles.frame, !failed && { aspectRatio: demo.asset ? 16 / 9 : 1 }]}>
      {!failed ? <Image key={attempt} ref={imageRef} source={demoSource(demo)} style={styles.image} contentFit="contain" cachePolicy={demo.asset ? 'none' : 'disk'} autoplay={playing && active} accessibilityLabel={`${demo.name}动作演示`} onLoad={() => settleLoad('ready')} onError={() => settleLoad('error')} /> : null}
      {!loaded ? <View style={[styles.status, failed && styles.failedStatus]}>{failed ? <><Text style={styles.error}>{status === 'timeout' ? '网络加载超时' : '动图加载失败'}</Text><Text style={styles.errorSub}>{demo.asset ? '本地素材未能打开，可重试或查看动作步骤' : '可重新加载，或先查看无需联网的动作步骤'}</Text><Button label="重新加载" variant="secondary" onPress={() => setLoad(current => ({ attempt: current.attempt + 1, status: 'loading' }))} /></> : <><ActivityIndicator color={C.accent} /><Text style={styles.errorSub}>正在加载动图…</Text></>}</View> : null}
    </View>
    <View style={styles.playerActions}>
      <Button label={playing ? '暂停动图' : '播放动图'} icon={playing ? 'pause-outline' : 'play-outline'} variant="secondary" disabled={!loaded} onPress={() => setManualPlaying(!playing)} style={styles.playerAction} />
      {onViewInstructions ? <Button label="动作步骤" icon="list-outline" variant="secondary" onPress={() => { setManualPlaying(false); onViewInstructions(); }} style={styles.playerAction} /> : null}
    </View>
    {reducedMotion && !playing ? <Text style={styles.creditText}>已跟随系统“减少动态效果”暂停，可手动播放。</Text> : null}
    <Text style={styles.caption}>{demo.caption}</Text>
    <Text style={styles.creditText}>{demo.asset ? '随应用提供，无需联网。可暂停观察动作。' : '已看过的动图会缓存，缓存被系统清理后需重新联网。文字说明始终可离线查看。'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: C.accent, fontWeight: '800', fontSize: 13 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: C.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  meta: { color: C.muted, fontSize: 13 },
  mediaBadge: { color: C.accent, fontSize: 11, backgroundColor: C.accentDark, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  player: { gap: 12 },
  playerActions: { flexDirection: 'row', gap: 10 }, playerAction: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  failedStatus: { position: 'relative', minHeight: 190 },
  frame: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#F5F7F4', width: '100%' },
  image: { width: '100%', height: '100%' },
  status: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  error: { color: C.text, fontWeight: '700' },
  errorSub: { color: C.muted, fontSize: 13 },
  caption: { color: C.muted, fontSize: 13, lineHeight: 20 },
  instructions: { gap: 12 },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepIndex: { color: C.accent, fontSize: 13, fontWeight: '800', width: 16, lineHeight: 22 },
  stepText: { color: C.text, fontSize: 13, lineHeight: 22, flex: 1 },
  tip: { color: C.text, fontSize: 13, lineHeight: 20 },
  divider: { backgroundColor: C.line, height: 1, marginVertical: 2 },
  credit: { gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 },
  creditText: { color: C.faint, fontSize: 11 },
  link: { color: C.accent, fontSize: 12, paddingVertical: 4 },
});
