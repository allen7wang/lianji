import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { demoFor, demoMediaLabel, demoSource, guideFor, type ExerciseDemo, type ExerciseGuide } from '@/lib/exercise-demos';
import type { Exercise } from '@/lib/types';
import { Button, Card, Empty, IconButton, Tag, Txt } from './components';
import { makeStyles, palettes, radius, space, useTheme } from './theme';
import { breathingProfileFor } from '@/lib/breathing';
import { BreathingGuide } from './breathing-guide';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export function ExerciseDemoModal({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return <Modal visible={exercise !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {exercise ? <DemoContent key={exercise.id} exercise={exercise} onClose={onClose} /> : null}
  </Modal>;
}

function DemoContent({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const s = useStyles();
  const demo = demoFor(exercise);
  const guide = guideFor(exercise);
  const breathing = breathingProfileFor(exercise);
  const scrollRef = useRef<ScrollView>(null);
  const instructionsY = useRef(0);
  const reducedMotion = useReducedMotion();
  const showInstructions = () => scrollRef.current?.scrollTo({ y: Math.max(0, instructionsY.current - 12), animated: reducedMotion === false });
  return <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
    <View style={s.header}>
      <Txt variant="overline" tone="muted" style={{ flex: 1 }}>动作演示</Txt>
      <IconButton icon="close" label="关闭动作演示" onPress={onClose} />
    </View>
    <ScrollView ref={scrollRef} contentContainerStyle={s.content}>
      <View style={s.titleBlock}>
        {!breathing ? <Txt variant="title1" accessibilityRole="header">{exercise.name}</Txt> : null}
        <View style={s.metaRow}>
          <Txt variant="caption" tone="muted">{exercise.muscle} · {exercise.equipment}</Txt>
          {demo ? <Tag label={demoMediaLabel(demo)} tone={demo.asset ? 'success' : 'data'} icon={demo.asset ? 'cloud-done-outline' : 'cloud-outline'} /> : null}
        </View>
      </View>
      {breathing ? <BreathingGuide profile={breathing} seconds={breathing.id === 'box_breathing' ? 64 : 60} /> : demo ? <DemoPlayer demo={demo} onViewInstructions={guide ? showInstructions : undefined} /> : <Card><Empty icon="videocam-outline" title="暂无动作动图" subtitle="自定义动作还没有配置演示素材" /></Card>}
      {guide ? <View onLayout={event => { instructionsY.current = event.nativeEvent.layout.y; }}><DemoInstructions guide={guide} /></View> : null}
      {demo ? <View style={s.credit}>
        <Txt variant="caption" tone="faint">素材：{demo.source}</Txt>
        <View style={s.links}>
          {demo.referenceUrl ? <SourceLink label="联网模型参考（需联网）" url={demo.referenceUrl} /> : null}
          {demo.sourceUrl ? <SourceLink label="查看来源" url={demo.sourceUrl} /> : null}
          {demo.licenseUrl ? <SourceLink label={demo.license} url={demo.licenseUrl} /> : null}
        </View>
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

function SourceLink({ label, url }: { label: string; url: string }) {
  const s = useStyles();
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => Linking.openURL(url).catch(console.error)} style={({ pressed }) => [s.link, pressed && s.pressed]}>
    <Txt variant="caption" tone="accent" style={{ fontWeight: '700' }}>{label}</Txt>
  </Pressable>;
}

function DemoInstructions({ guide }: { guide: ExerciseGuide }) {
  const s = useStyles();
  const { c } = useTheme();
  return <View style={s.instructions}>
    <Card style={s.instructionCard}>
      <Txt variant="title3" accessibilityRole="header">动作步骤</Txt>
      {guide.steps.map((step, index) => <View key={step} style={s.stepRow}>
        <View style={s.stepIndex}><Txt variant="caption" style={s.stepNumber}>{index + 1}</Txt></View>
        <Txt variant="body" style={{ flex: 1 }}>{step}</Txt>
      </View>)}
    </Card>
    <Card style={s.instructionCard}>
      <Txt variant="title3" accessibilityRole="header">动作要点</Txt>
      {guide.cues.map(cue => <View key={cue} style={s.bulletRow}>
        <View style={[s.bullet, { backgroundColor: c.data }]} />
        <Txt variant="body" style={{ flex: 1 }}>{cue}</Txt>
      </View>)}
      <View style={s.divider} />
      <Txt variant="title3" accessibilityRole="header">常见错误</Txt>
      {guide.mistakes.map(mistake => <View key={mistake} style={s.bulletRow}>
        <Ionicons name="alert-circle-outline" size={16} color={c.warning} style={s.mistakeIcon} />
        <Txt variant="body" tone="muted" style={{ flex: 1 }}>{mistake}</Txt>
      </View>)}
    </Card>
    <Txt variant="caption" tone="faint">演示仅供动作参考，不代表适合所有人的负重或幅度。不适时停止练习，先确保动作可控。</Txt>
  </View>;
}

function DemoPlayer({ demo, onViewInstructions }: { demo: ExerciseDemo; onViewInstructions?: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
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

  return <View style={s.player}>
    <View style={[s.frame, !failed && { aspectRatio: Math.max(1, demo.aspectRatio ?? (demo.asset ? 16 / 9 : 1)) }]}>
      {!failed ? <Image key={attempt} ref={imageRef} source={demoSource(demo)} style={s.image} contentFit="contain" cachePolicy={demo.asset ? 'none' : 'disk'} autoplay={playing && active} accessibilityLabel={`${demo.name}动作演示`} onLoad={() => settleLoad('ready')} onError={() => settleLoad('error')} /> : null}
      {!loaded ? <View style={[s.status, failed && s.failedStatus]}>
        {failed ? <>
          <View style={s.statusIcon}><Ionicons name={status === 'timeout' ? 'cloud-offline-outline' : 'image-outline'} size={24} color={c.textMuted} /></View>
          <Txt variant="title3" accessibilityRole="alert">{status === 'timeout' ? '网络加载超时' : '动图加载失败'}</Txt>
          <Txt variant="caption" tone="muted" style={{ textAlign: 'center' }}>{demo.asset ? '本地素材未能打开，可重试或查看动作步骤' : '可重新加载，或先查看无需联网的动作步骤'}</Txt>
          <Button label="重新加载" icon="refresh-outline" variant="secondary" size="sm" onPress={() => setLoad(current => ({ attempt: current.attempt + 1, status: 'loading' }))} />
        </> : <>
          <ActivityIndicator color={c.accent} />
          <Txt variant="caption" tone="muted">正在加载动图…</Txt>
        </>}
      </View> : null}
      {loaded && !playing ? <View style={s.pausedBadge}><Ionicons name="pause" size={12} color={c.onInverse} /><Txt variant="caption" tone="inverse" style={s.pausedText}>已暂停</Txt></View> : null}
    </View>
    <View style={s.playerActions}>
      <Button label={playing ? '暂停动图' : '播放动图'} icon={playing ? 'pause' : 'play'} variant="secondary" disabled={!loaded} onPress={() => setManualPlaying(!playing)} style={s.playerAction} />
      {onViewInstructions ? <Button label="动作步骤" icon="list-outline" variant="secondary" onPress={() => { setManualPlaying(false); onViewInstructions(); }} style={s.playerAction} /> : null}
    </View>
    {reducedMotion && !playing ? <Txt variant="caption" tone="muted">已跟随系统“减少动态效果”暂停，可手动播放。</Txt> : null}
    <Txt variant="body" tone="muted">{demo.caption}</Txt>
    <View style={s.offlineNote}>
      <Ionicons name={demo.asset ? 'cloud-done-outline' : 'cloud-download-outline'} size={16} color={c.textMuted} />
      <Txt variant="caption" tone="muted" style={{ flex: 1 }}>{demo.asset ? '随应用提供，无需联网。可暂停观察动作。' : '已看过的动图会缓存，缓存被系统清理后需重新联网。文字说明始终可离线查看。'}</Txt>
    </View>
  </View>;
}

const useStyles = makeStyles(c => ({
  screen: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: space.page, paddingTop: space.lg, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md },
  content: { paddingHorizontal: space.page, paddingBottom: space.xxxl, gap: space.xl },
  titleBlock: { gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  player: { gap: space.md },
  // Demo GIFs are drawn on white, so the frame stays paper-white in both schemes.
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palettes.light.surface, borderWidth: 1, borderColor: c.border, width: '100%' },
  image: { width: '100%', height: '100%' },
  status: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  failedStatus: { position: 'relative', minHeight: 220 },
  statusIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  pausedBadge: { position: 'absolute', top: space.md, left: space.md, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: c.inverse },
  pausedText: { fontSize: 11, fontWeight: '700' },
  playerActions: { flexDirection: 'row', gap: space.sm },
  playerAction: { flex: 1, minWidth: 0, paddingHorizontal: space.md },
  offlineNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  instructions: { gap: space.md },
  instructionCard: { gap: space.md },
  stepRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  stepNumber: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  bulletRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8, marginHorizontal: 5 },
  mistakeIcon: { marginTop: 3 },
  divider: { backgroundColor: c.border, height: 1, marginVertical: space.xs },
  credit: { gap: space.xs, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg },
  link: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.7 },
}));
