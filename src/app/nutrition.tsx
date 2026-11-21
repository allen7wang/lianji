import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useActions, useLibrary, useWellness } from '@/lib/data';
import { dayTotals, frequentFoods, goalProgress, mealForTime, meals, recentFoods, sameLocalDay, type FoodTemplate } from '@/lib/nutrition';
import { dateLabel, type FoodEntry } from '@/lib/types';
import { buildNutritionTrend } from '@/lib/wellness-trend';
import { Badge, Button, Card, Empty, Field, Header, IconButton, ListRow, Metric, Page, ProgressTrack, SectionTitle, Segmented, Sheet, Txt } from '@/ui/components';
import { space } from '@/ui/theme';
import { WellnessTrendChart } from '@/ui/wellness-trend-chart';

const number = (value: string) => Number(value.trim().replace(',', '.'));
const modes = [{ value: 'recent', label: '最近吃过' }, { value: 'frequent', label: '常吃' }] as const;
const emptyFood = { name: '', portion: '', calories: '', protein: '', carbs: '', fat: '' };
const nutrients = [
  { field: 'calories', label: '热量 · 千卡' }, { field: 'protein', label: '蛋白质 · g' },
  { field: 'carbs', label: '碳水 · g' }, { field: 'fat', label: '脂肪 · g' },
] as const;

export default function Nutrition() {
  const { ready, preferences } = useLibrary();
  const { foodEntries } = useWellness();
  const { addFoodEntry, deleteFoodEntry, relogFood, setPreferences } = useActions();
  const [sheet, setSheet] = useState<'food' | 'goals' | null>(null);
  const [offset, setOffset] = useState(0);
  const [meal, setMeal] = useState(mealForTime);
  const [food, setFood] = useState(emptyFood);
  const [calorieGoal, setCalorieGoal] = useState('');
  const [proteinGoal, setProteinGoal] = useState('');
  const [mode, setMode] = useState<'recent' | 'frequent'>('recent');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const date = new Date();
  date.setDate(date.getDate() - offset);
  const entries = foodEntries.filter(entry => sameLocalDay(entry.loggedAt, date));
  const totals = dayTotals(entries, date);
  const calories = goalProgress(totals.calories, preferences.calorieGoal);
  const protein = goalProgress(totals.protein, preferences.proteinGoal);
  const quick = useMemo(() => mode === 'recent' ? recentFoods(foodEntries) : frequentFoods(foodEntries), [foodEntries, mode]);
  const points = useMemo(() => buildNutritionTrend(foodEntries).map(day => ({ id: day.day, date: day.day, value: day.calories })), [foodEntries]);
  const groups = [...new Set([...meals, ...entries.map(entry => entry.meal)])]
    .map(name => ({ name, entries: entries.filter(entry => entry.meal === name) }))
    .filter(group => group.entries.length);
  const rows = groups.flatMap(({ name, entries }) => entries.map((entry, index) => ({
    entry, heading: index === 0 ? `${name || '其他'} · ${Math.round(entries.reduce((sum, item) => sum + item.calories, 0))} 千卡` : undefined,
  })));

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try { await action(); }
    catch (error) { Alert.alert('操作失败', error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; setPending(false); }
  }

  function openAdd() {
    if (running.current || sheet !== null) return;
    setOffset(0);
    setMeal(mealForTime());
    setSheet('food');
  }

  function saveFood() {
    if (!food.name.trim()) return Alert.alert('请输入食物名称');
    const [calories, protein, carbs, fat] = nutrients.map(({ field }) => number(food[field]));
    if ([calories, protein, carbs, fat].some(value => !Number.isFinite(value) || value < 0 || value > 10000)) {
      return Alert.alert('请输入有效的营养数据', '热量和营养素须为 0–10000。');
    }
    void run(async () => {
      await addFoodEntry({ ...food, portion: food.portion.trim() || '1 份', meal, calories, protein, carbs, fat });
      setFood(emptyFood);
      setSheet(null);
    });
  }

  function saveGoals() {
    const nextCalories = number(calorieGoal);
    const nextProtein = number(proteinGoal);
    if (!Number.isInteger(nextCalories) || nextCalories < 0 || nextCalories > 10000 ||
        !Number.isInteger(nextProtein) || nextProtein < 0 || nextProtein > 1000) {
      return Alert.alert('请检查每日目标', '热量须为 0–10000 千卡，蛋白质须为 0–1000 克的整数。');
    }
    void run(async () => {
      await setPreferences({ calorieGoal: nextCalories, proteinGoal: nextProtein });
      setSheet(null);
    });
  }

  function quickAdd(item: FoodTemplate) {
    void run(async () => {
      await relogFood(item, meal);
      setMessage(`已将${item.name}记录到今天的${meal}`);
    });
  }

  function remove(entry: FoodEntry) {
    Alert.alert('删除饮食记录', `确定删除“${entry.name}”？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => run(() => deleteFoodEntry(entry.id)) },
    ]);
  }

  return <Page scroll={false}>
    <FlatList data={rows} keyExtractor={({ entry }) => entry.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.page, gap: space.md }}
      ListHeaderComponent={<View style={{ gap: space.lg }}>
        <Header title="饮食记录" onBack={() => router.canGoBack() ? router.back() : router.navigate('/')}
          right={<IconButton icon="add" label="添加食物" disabled={!ready || pending || sheet !== null} onPress={openAdd} />} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label="前一天" disabled={offset >= 30} onPress={() => setOffset(value => value + 1)} />
          <Txt variant="title3">{offset === 0 ? '今天' : offset === 1 ? '昨天' : dateLabel(date.toISOString())}</Txt>
          <IconButton icon="chevron-forward" label="后一天" disabled={offset === 0} onPress={() => setOffset(value => value - 1)} />
        </View>
        <Card variant="data">
          <SectionTitle title={offset === 0 ? '今日摄入' : '当日摄入'} action={ready && !pending ? '设置目标' : undefined} onAction={() => {
            setCalorieGoal(String(preferences.calorieGoal));
            setProteinGoal(String(preferences.proteinGoal));
            setSheet('goals');
          }} />
          <Txt variant="display">{totals.calories}<Txt variant="title3" tone="muted"> {calories === null ? '' : `/ ${preferences.calorieGoal} `}千卡</Txt></Txt>
          {calories === null ? null : <ProgressTrack value={calories} tone="data" />}
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Metric value={String(totals.protein)} unit="g" label="蛋白质" />
            <Metric value={String(totals.carbs)} unit="g" label="碳水" />
            <Metric value={String(totals.fat)} unit="g" label="脂肪" />
          </View>
          {protein === null ? null : <>
            <Txt variant="caption" tone="muted">蛋白质 {totals.protein} / {preferences.proteinGoal} g</Txt>
            <ProgressTrack value={protein} tone="data" />
          </>}
        </Card>
        {offset === 0 && quick.length > 0 ? <Card>
          <SectionTitle title="快速记录" />
          <Segmented options={modes} value={mode} onChange={setMode} />
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>{meals.map(value => <Badge key={value} label={value} active={value === meal} onPress={() => setMeal(value)} />)}</View>
          {quick.map(item => <ListRow key={JSON.stringify([item.name, item.portion])} title={item.name}
            subtitle={`${item.portion} · ${item.calories} 千卡`} icon="add-circle-outline" onPress={pending ? undefined : () => quickAdd(item)} />)}
          {message ? <Txt variant="caption" tone="muted" accessibilityLiveRegion="polite">{message}</Txt> : null}
        </Card> : null}
        {points.length > 0 ? <WellnessTrendChart description="近期摄入" points={points} unit="千卡" /> : null}
        <SectionTitle title={offset === 0 ? '今天吃了什么' : '当天吃了什么'} action={ready && !pending ? '新增' : undefined} onAction={openAdd} />
      </View>}
      ListEmptyComponent={<Empty icon="nutrition-outline" title={ready ? '当天没有饮食记录' : '正在读取饮食记录'} subtitle={ready ? '记录每餐营养，查看每日摄入。' : ''} />}
      renderItem={({ item: { entry, heading } }) => <View style={{ gap: space.sm }}>
        {heading ? <Txt variant="bodyStrong">{heading}</Txt> : null}
        <Card><ListRow title={entry.name} subtitle={`${entry.portion} · ${entry.calories} 千卡 · 蛋白 ${entry.protein} g · 碳水 ${entry.carbs} g · 脂肪 ${entry.fat} g`}
          divider={false} icon="restaurant-outline" right={<IconButton icon="trash-outline" label={`删除${entry.name}`} variant="plain" onPress={() => remove(entry)} />} /></Card>
      </View>} />
    <Sheet visible={sheet !== null} title={sheet === 'goals' ? '每日营养目标' : '添加食物'}
      subtitle={sheet === 'goals' ? '填 0 可关闭对应目标' : undefined}
      closeDisabled={pending} onClose={() => setSheet(null)}>
      {sheet === 'food' ? <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{meals.map(value => <Badge key={value} label={value} active={value === meal} onPress={() => setMeal(value)} />)}</View>
        <Field label="食物名称" value={food.name} onChangeText={name => setFood(current => ({ ...current, name }))} />
        <Field label="份量" value={food.portion} onChangeText={portion => setFood(current => ({ ...current, portion }))} />
        {nutrients.map(({ field, label }) => <Field key={field} label={label} value={food[field]} keyboardType="decimal-pad"
          onChangeText={value => setFood(current => ({ ...current, [field]: value }))} />)}
        <Button label="保存食物" loading={pending} onPress={saveFood} />
      </> : sheet === 'goals' ? <>
        <Field label="热量 · 千卡" value={calorieGoal} onChangeText={setCalorieGoal} keyboardType="number-pad" />
        <Field label="蛋白质 · g" value={proteinGoal} onChangeText={setProteinGoal} keyboardType="number-pad" />
        <Button label="保存目标" loading={pending} onPress={saveGoals} />
      </> : null}
    </Sheet>
  </Page>;
}
