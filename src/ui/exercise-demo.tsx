import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { demoFor, demoSource, type ExerciseDemo } from '@/lib/exercise-demos';
import type { Exercise } from '@/lib/types';
import { Button, Empty, IconButton } from './components';
import { C } from './theme';
import { breathingProfileFor } from '@/lib/breathing';
import { BreathingGuide } from './breathing-guide';

export function ExerciseDemoModal({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return <Modal visible={exercise !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {exercise ? <DemoContent key={exercise.id} exercise={exercise} onClose={onClose} /> : null}
  </Modal>;
}

function DemoContent({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const demo = demoFor(exercise);
  const breathing = breathingProfileFor(exercise);
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}><Text style={styles.eyebrow}>动作演示</Text><IconButton icon="close" onPress={onClose} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      {!breathing ? <Text style={styles.title}>{exercise.name}</Text> : null}
      <Text style={styles.meta}>{exercise.muscle} · {exercise.equipment}</Text>
      {breathing ? <BreathingGuide profile={breathing} seconds={breathing.id === 'box_breathing' ? 64 : 60} /> : demo ? <DemoPlayer demo={demo} /> : <Empty icon="videocam-outline" title="暂无动作动图" subtitle="自定义动作还没有配置演示素材" />}
    </ScrollView>
  </SafeAreaView>;
}

function DemoPlayer({ demo }: { demo: ExerciseDemo }) {
  const imageRef = useRef<Image>(null);
  const [playing, setPlaying] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const operation = playing && active ? imageRef.current?.startAnimating() : imageRef.current?.stopAnimating();
    operation?.catch(console.error);
  }, [playing, active, loaded]);

  return <View style={styles.player}>
    <View style={styles.frame}>
      {!failed ? <Image key={attempt} ref={imageRef} source={demoSource(demo)} style={styles.image} contentFit="contain" cachePolicy="memory-disk" autoplay={playing && active} accessibilityLabel={`${demo.name}动作演示`} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} /> : null}
      {!loaded ? <View style={styles.status}>{failed ? <><Text style={styles.error}>动图加载失败</Text><Text style={styles.errorSub}>检查网络后重新加载</Text><Button label="重新加载" variant="secondary" onPress={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }} /></> : <><ActivityIndicator color={C.accent} /><Text style={styles.errorSub}>正在加载动图…</Text></>}</View> : null}
    </View>
    {loaded ? <Button label={playing ? '暂停动图' : '播放动图'} icon={playing ? 'pause-outline' : 'play-outline'} variant="secondary" onPress={() => setPlaying(value => !value)} /> : null}
    <Text style={styles.caption}>{demo.caption}</Text>
    <View style={styles.credit}>
      <Text style={styles.creditText}>素材：{demo.source}</Text>
      {demo.sourceUrl ? <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(demo.sourceUrl!).catch(console.error)}>查看来源</Text> : null}
      {demo.licenseUrl ? <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(demo.licenseUrl!).catch(console.error)}>{demo.license}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: C.accent, fontWeight: '800', fontSize: 13 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: C.text },
  meta: { color: C.muted, fontSize: 13, marginBottom: 12 },
  player: { gap: 16 },
  frame: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#F5F7F4', width: '100%', aspectRatio: 1.25 },
  image: { width: '100%', height: '100%' },
  status: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  error: { color: C.text, fontWeight: '700' },
  errorSub: { color: C.muted, fontSize: 13 },
  caption: { color: C.muted, fontSize: 13, lineHeight: 20 },
  credit: { gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 },
  creditText: { color: C.faint, fontSize: 11 },
  link: { color: C.accent, fontSize: 12, paddingVertical: 4 },
});
