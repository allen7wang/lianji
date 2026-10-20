import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDocumentAsync } from 'expo-document-picker';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseBackup } from '@/lib/backup';
import { useData } from '@/lib/data';
import { dateLabel } from '@/lib/types';
import { Button, Card, Empty, Field, Header, IconButton, Page, SectionTitle } from '@/ui/components';
import { C } from '@/ui/theme';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function Me() {
  const { bodyEntries, workouts, addBodyEntry, deleteBodyEntry, exportBackupData, restoreBackup } = useData();
  const [modal, setModal] = useState(false);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  async function save() {
    const n = Number(weight.replace(',', '.'));
    const fat = bodyFat.trim() ? Number(bodyFat.replace(',', '.')) : null;
    if (!Number.isFinite(n) || n <= 0 || n > 500) return Alert.alert('请输入有效体重');
    if (fat !== null && (!Number.isFinite(fat) || fat < 0 || fat > 100)) return Alert.alert('请输入 0–100 的体脂率');
    await addBodyEntry(n, fat);
    setWeight(''); setBodyFat(''); setModal(false);
  }
  async function exportFlow() {
    try {
      const backup = await exportBackupData();
      const file = new File(Paths.cache, `lianji-backup-${backup.exportedAt.slice(0, 10)}.json`);
      file.create({ overwrite: true, intermediates: true });
      file.write(JSON.stringify(backup));
      if (!(await Sharing.isAvailableAsync())) return Alert.alert('无法分享', '当前设备不支持系统分享，无法导出备份。');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '保存练迹备份' });
    } catch (error) {
      Alert.alert('导出失败', errorMessage(error));
    }
  }
  async function importFlow() {
    try {
      const result = await getDocumentAsync({ type: ['application/json'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const backup = parseBackup(await new File(result.assets[0].uri).text());
      const tables = backup.tables;
      const finished = tables.workouts.filter(item => item.endedAt).length;
      Alert.alert('恢复备份', `备份导出于 ${dateLabel(backup.exportedAt)}，包含 ${tables.plans.length} 个计划、${finished} 次已完成训练、${tables.body_entries.length} 条身体记录和 ${tables.food_entries.length} 条饮食记录。恢复会用备份替换本机当前全部数据，且不可撤销。`, [
        { text: '取消', style: 'cancel' },
        { text: '替换并恢复', style: 'destructive', onPress: () => { restoreBackup(backup).then(() => Alert.alert('恢复完成', '练迹数据已从备份恢复。')).catch(error => Alert.alert('恢复失败', errorMessage(error))); } },
      ]);
    } catch (error) {
      Alert.alert('无法读取备份', errorMessage(error));
    }
  }
  return <Page>
    <Header eyebrow="YOUR BODY" title="我的数据" right={<IconButton icon="add" onPress={() => setModal(true)} />} />
    <Card style={styles.summary}><View><Text style={styles.summaryLabel}>最近体重</Text><Text style={styles.weight}>{bodyEntries[0]?.weight ?? '—'} <Text style={styles.unit}>kg</Text></Text><Text style={styles.summarySub}>{bodyEntries[0] ? dateLabel(bodyEntries[0].recordedAt) + ' 更新' : '还没有记录'}</Text></View><View style={styles.summaryIcon}><Ionicons name="body-outline" size={33} color={C.accent} /></View></Card>
    <View style={styles.tiles}><Card style={{ flex: 1 }}><Text style={styles.tileValue}>{workouts.filter(item => item.endedAt).length}</Text><Text style={styles.tileLabel}>累计训练</Text></Card><Card style={{ flex: 1 }}><Text style={styles.tileValue}>{bodyEntries.length}</Text><Text style={styles.tileLabel}>身体记录</Text></Card></View>
    <SectionTitle title="身体记录" action="新增" onAction={() => setModal(true)} />
    {bodyEntries.length ? bodyEntries.map(entry => <View key={entry.id} style={styles.row}><View><Text style={styles.rowDate}>{dateLabel(entry.recordedAt)}</Text><Text style={styles.rowSub}>{entry.bodyFat === null ? '未记录体脂率' : `体脂率 ${entry.bodyFat}%`}</Text></View><View style={styles.rowRight}><Text style={styles.rowWeight}>{entry.weight} kg</Text><Pressable onPress={() => Alert.alert('删除记录', '确定删除这条身体数据？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteBodyEntry(entry.id) }])} hitSlop={10}><Ionicons name="trash-outline" size={17} color={C.faint} /></Pressable></View></View>) : <Empty icon="body-outline" title="记录身体变化" subtitle="添加体重和体脂率，观察训练带来的改变" />}
    <SectionTitle title="数据与备份" />
    <Card style={{ gap: 12 }}>
      <Text style={styles.localTitle}>备份保存在「文件」</Text>
      <Text style={styles.localCopy}>导出全部计划、训练记录、身体和饮食数据为一个 JSON 文件，可存到 iCloud Drive 或其他位置；恢复时会用备份整体替换本机当前数据。Mac 与 Apple Watch 的数据各自独立，不在手机备份内。</Text>
      <View style={styles.backupActions}><Button label="导出备份" icon="share-outline" onPress={exportFlow} style={{ flex: 1 }} /><Button label="从备份恢复" icon="download-outline" variant="secondary" onPress={importFlow} style={{ flex: 1 }} /></View>
    </Card>
    <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}><SafeAreaView style={styles.modal} edges={['top', 'bottom']}><View style={styles.modalHeader}><Text style={styles.modalTitle}>记录身体数据</Text><IconButton icon="close" onPress={() => setModal(false)} /></View><View style={{ padding: 20, gap: 20 }}><Field label="体重 · kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="例如 70.5" /><Field label="体脂率 · %（可选）" value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" placeholder="例如 18.2" /><Button label="保存记录" onPress={save} /></View></SafeAreaView></Modal>
  </Page>;
}

const styles = StyleSheet.create({
  summary: { minHeight: 145, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#253B1D' }, summaryLabel: { color: '#B6CCA9', fontSize: 13 }, weight: { color: C.text, fontWeight: '800', fontSize: 38, marginTop: 8 }, unit: { fontSize: 18, fontWeight: '600' }, summarySub: { color: '#B6CCA9', fontSize: 12, marginTop: 5 }, summaryIcon: { width: 70, height: 70, borderRadius: 22, backgroundColor: '#36542A', alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 12 }, tileValue: { color: C.accent, fontSize: 25, fontWeight: '800' }, tileLabel: { color: C.muted, fontSize: 12, marginTop: 6 },
  row: { paddingVertical: 16, borderBottomColor: C.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, rowDate: { color: C.text, fontSize: 15, fontWeight: '700' }, rowSub: { color: C.muted, fontSize: 12, marginTop: 5 }, rowRight: { flexDirection: 'row', alignItems: 'center', gap: 18 }, rowWeight: { color: C.accent, fontSize: 16, fontWeight: '700' },
  localTitle: { color: C.text, fontSize: 14, fontWeight: '700' }, localCopy: { color: C.muted, fontSize: 12, lineHeight: 20, marginTop: 6 }, backupActions: { flexDirection: 'row', gap: 10, marginTop: 6 }, modal: { flex: 1, backgroundColor: C.bg }, modalHeader: { paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: C.text, fontSize: 24, fontWeight: '800' },
});
