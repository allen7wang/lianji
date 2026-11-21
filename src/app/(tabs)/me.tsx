import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDocumentAsync } from 'expo-document-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { mergeSummaryLabel, parseBackup, type BackupFile, type RestoreMode } from '@/lib/backup';
import { useActions, useHistory, useLibrary, useWellness } from '@/lib/data';
import { healthStoreName, isHealthAvailable, requestHealthAccess } from '@/lib/health';
import { ensureNotificationPermission } from '@/lib/notifications';
import { dateLabel, type DeviceSettings } from '@/lib/types';
import { formatWeight, formatWeightValue, parseWeightInput } from '@/lib/units';
import { buildBodyTrend } from '@/lib/wellness-trend';
import { Button, Card, Empty, Field, Header, IconButton, ListRow, Metric, Page, SectionTitle, Segmented, Sheet, Tag, Txt } from '@/ui/components';
import { toDisplayWeight } from '@/ui/set-display';
import { space, useTheme } from '@/ui/theme';
import { WellnessTrendChart } from '@/ui/wellness-trend-chart';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const units = [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }] as const;

export default function Me() {
  const { c } = useTheme();
  const { ready, preferences: { weightUnit }, deviceSettings, snapshot } = useLibrary();
  const { workouts } = useHistory();
  const { bodyEntries } = useWellness();
  const { addBodyEntry, deleteBodyEntry, exportBackupData, restoreBackup, undoLastImport, setDeviceSettings, setPreferences } = useActions();
  const [modal, setModal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const operation = useRef(false);
  useEffect(() => {
    let active = true;
    isHealthAvailable().then(value => { if (active) setHealthAvailable(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const trend = useMemo(() => buildBodyTrend(bodyEntries), [bodyEntries]);
  const weightPoints = trend.points.map(entry => ({ id: entry.id, date: entry.recordedAt, value: toDisplayWeight(entry.weight, weightUnit) }));
  const fatPoints = trend.fatPoints.map(entry => ({ id: entry.id, date: entry.recordedAt, value: entry.bodyFat }));
  const delta = trend.weightDelta;
  const deltaValue = delta === null ? null : formatWeightValue(Math.abs(delta), weightUnit);

  async function run(title: string, action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    try { await action(); }
    catch (error) { Alert.alert(title, errorMessage(error)); }
    finally { operation.current = false; setPending(false); }
  }

  function save() {
    const amount = parseWeightInput(weight, weightUnit);
    const fat = bodyFat.trim() ? Number(bodyFat.replace(',', '.')) : null;
    if (amount === null || amount <= 0 || amount > 500) return Alert.alert('请输入有效体重');
    if (fat !== null && (!Number.isFinite(fat) || fat < 0 || fat > 100)) return Alert.alert('请输入 0–100 的体脂率');
    void run('保存失败', async () => {
      await addBodyEntry(amount, fat);
      setWeight(''); setBodyFat(''); setModal(false);
    });
  }

  function exportFlow() {
    void run('导出失败', async () => {
      const backup = await exportBackupData();
      const filename = `lianji-backup-${backup.exportedAt.slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      }
      if (!await Sharing.isAvailableAsync()) throw new Error('当前设备不支持系统分享。');
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true, intermediates: true });
      file.write(JSON.stringify(backup));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '保存练迹备份' });
    });
  }

  function restore(backup: BackupFile, mode: RestoreMode) {
    void run('恢复失败', async () => {
      const summary = await restoreBackup(backup, mode);
      Alert.alert('导入完成', summary ? mergeSummaryLabel(summary) : '已使用备份替换本机数据。');
    });
  }

  function importFlow() {
    void run('无法读取备份', async () => {
      const result = await getDocumentAsync({ type: ['application/json'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const { uri } = result.assets[0];
      const backup = parseBackup(Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text());
      const { plans, workouts, body_entries, food_entries } = backup.tables;
      Alert.alert('恢复备份', `${dateLabel(backup.exportedAt)} 导出，含 ${plans.length} 个计划、${workouts.filter(item => item.endedAt).length} 次已完成训练、${body_entries.length} 条身体和 ${food_entries.length} 条饮食记录。合并保留本机已有记录，替换会覆盖本机数据。导入前会自动保存快照。`, [
        { text: '取消', style: 'cancel' },
        { text: '替换…', style: 'destructive', onPress: () => Alert.alert('替换本机数据？', '当前训练、计划、身体和饮食数据会被备份覆盖。', [
          { text: '取消', style: 'cancel' },
          { text: '替换并恢复', style: 'destructive', onPress: () => restore(backup, 'replace') },
        ]) },
        { text: '合并（推荐）', onPress: () => restore(backup, 'merge') },
      ]);
    });
  }

  function changeSetting(key: keyof DeviceSettings, enabled: boolean) {
    void run('无法更新设置', async () => {
      if (key === 'restNotifications' && enabled && !await ensureNotificationPermission()) {
        Alert.alert('通知权限未开启', '请在系统设置里允许练迹发送通知，再打开休息结束提醒。');
        return;
      }
      if (key === 'healthSync' && enabled && !await requestHealthAccess()) {
        Alert.alert('健康权限未开启', '请允许练迹写入健康数据后再试。');
        return;
      }
      await setDeviceSettings({ [key]: enabled });
    });
  }

  function toggle(key: keyof DeviceSettings, title: string, subtitle: string) {
    return <ListRow title={title} subtitle={subtitle} right={
      <Switch accessibilityLabel={title} disabled={pending || !ready} value={deviceSettings[key]}
        trackColor={{ false: c.border, true: c.accent }} onValueChange={value => changeSetting(key, value)} />
    } />;
  }

  return <Page>
    <Header title="我的数据" right={<IconButton icon="add" label="记录身体数据" disabled={!ready} onPress={() => setModal(true)} />} />
    <Card variant="data">
      <Txt variant="caption" tone="muted">最近体重</Txt>
      <Txt variant="display">{trend.latest ? formatWeightValue(trend.latest.weight, weightUnit) : '—'} <Txt variant="title3" tone="muted">{weightUnit}</Txt></Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <Txt variant="caption" tone="muted">{trend.latest ? `${dateLabel(trend.latest.recordedAt)} 更新` : '还没有记录'}</Txt>
        {deltaValue !== null ? <Tag tone="data" label={deltaValue === '0' ? '与上次相同' : `${delta! > 0 ? '+' : '−'}${deltaValue} ${weightUnit}`} /> : null}
      </View>
    </Card>
    {weightPoints.length >= 2 ? <WellnessTrendChart description="体重趋势" points={weightPoints} unit={weightUnit} /> : null}
    {fatPoints.length >= 2 ? <WellnessTrendChart description="体脂率趋势" points={fatPoints} unit="%" /> : null}
    <Card style={{ flexDirection: 'row', gap: space.xl }}>
      <Metric value={String(workouts.length)} label="累计训练" />
      <Metric value={String(bodyEntries.length)} label="身体记录" />
    </Card>
    <SectionTitle title="身体记录" action={ready ? '新增' : undefined} onAction={() => setModal(true)} />
    {bodyEntries.length ? <Card>
      {(expanded ? bodyEntries : bodyEntries.slice(0, 10)).map(entry => <ListRow key={entry.id} title={formatWeight(entry.weight, weightUnit)}
        subtitle={`${dateLabel(entry.recordedAt)} · ${entry.bodyFat === null ? '未记录体脂率' : `体脂率 ${entry.bodyFat}%`}`}
        right={<IconButton icon="trash-outline" variant="plain" label={`删除 ${dateLabel(entry.recordedAt)} 身体记录`} onPress={() => Alert.alert('删除记录', '确定删除这条身体数据？', [
          { text: '取消', style: 'cancel' },
          { text: '删除', style: 'destructive', onPress: () => run('删除失败', () => deleteBodyEntry(entry.id)) },
        ])} />} />)}
      {bodyEntries.length > 10 ? <Button label={expanded ? '收起' : '显示全部'} variant="plain" onPress={() => setExpanded(value => !value)} /> : null}
    </Card> : <Empty icon="body-outline" title={ready ? '记录身体变化' : '正在读取身体记录'} subtitle={ready ? '添加体重和体脂率，查看历史变化。' : ''} />}
    <SectionTitle title="设置" />
    <Card>
      <Txt variant="bodyStrong">重量单位</Txt>
      <Segmented options={units} value={weightUnit} accessibilityLabel="重量单位" onChange={value => {
        if (ready) void run('无法切换重量单位', () => setPreferences({ weightUnit: value }));
      }} />
      {Platform.OS !== 'web' ? <>
        {toggle('restNotifications', '休息结束提醒', '计时结束时发送系统通知')}
        {toggle('keepAwake', '训练时屏幕常亮', '停留在训练页时保持屏幕开启')}
        {toggle('haptics', '训练震动反馈', '完成组次和计时结束时震动')}
        {healthAvailable && healthStoreName ? toggle('healthSync', `写入${healthStoreName}`, '保存之后完成的训练、体重和体脂率') : null}
      </> : null}
    </Card>
    <SectionTitle title="数据与备份" />
    <Card>
      <Txt tone="muted">备份可在各端导入。合并时保留本机已有记录，替换前会自动保存快照。</Txt>
      <Button label="导出备份" icon="share-outline" variant="secondary" disabled={!ready || pending} onPress={exportFlow} />
      <Button label="从备份恢复" icon="download-outline" variant="secondary" disabled={!ready || pending} onPress={importFlow} />
      {snapshot ? <ListRow title="撤销上次导入" subtitle={`${dateLabel(snapshot.createdAt)} · ${snapshot.reason === 'merge' ? '合并' : '替换'}前的快照`} divider={false} onPress={() => {
        if (pending) return;
        Alert.alert('撤销上次导入？', '会恢复到导入前的状态，之后新增的记录也会被覆盖。', [
          { text: '取消', style: 'cancel' },
          { text: '撤销导入', style: 'destructive', onPress: () => run('撤销失败', undoLastImport) },
        ]);
      }} /> : null}
    </Card>
    <Sheet visible={modal} title="记录身体数据" closeDisabled={pending} onClose={() => setModal(false)}>
      <Field label={`体重 · ${weightUnit}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
      <Field label="体脂率 · %（可选）" value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" />
      <Button label="保存记录" loading={pending} onPress={save} />
    </Sheet>
  </Page>;
}
