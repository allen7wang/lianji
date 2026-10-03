import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { dateLabel } from '@/lib/types';
import { Badge, Button, Card, Empty, Field, Header, IconButton, Metric, Page, SectionTitle } from '@/ui/components';
import { C } from '@/ui/theme';

const meals = ['早餐', '午餐', '晚餐', '加餐'];
const parse = (value: string) => Number(value.replace(',', '.'));

export default function Nutrition() {
  const { foodEntries, addFoodEntry, deleteFoodEntry } = useData();
  const [modal, setModal] = useState(false);
  const [offset, setOffset] = useState(0);
  const [meal, setMeal] = useState('早餐');
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const selectedDate = new Date();
  selectedDate.setDate(selectedDate.getDate() - offset);
  const entries = foodEntries.filter(entry => new Date(entry.loggedAt).toDateString() === selectedDate.toDateString());
  const sum = (field: 'calories' | 'protein' | 'carbs' | 'fat') => Math.round(entries.reduce((total, entry) => total + entry[field], 0) * 10) / 10;
  const openAdd = () => { setOffset(0); setModal(true); };

  async function save() {
    if (!name.trim()) return Alert.alert('请输入食物名称');
    const values = [calories, protein, carbs, fat].map(parse);
    if (values.some(value => !Number.isFinite(value) || value < 0 || value > 10000)) return Alert.alert('请输入有效的营养数据', '热量和三大营养素都需要填写非负数字。');
    await addFoodEntry({ meal, name, portion: portion || '1 份', calories: values[0], protein: values[1], carbs: values[2], fat: values[3] });
    setName(''); setPortion(''); setCalories(''); setProtein(''); setCarbs(''); setFat(''); setModal(false);
  }

  return <Page>
    <View style={styles.back}><IconButton icon="chevron-back" onPress={() => router.back()} /></View>
    <Header eyebrow="FOOD JOURNAL" title="饮食记录" right={<IconButton icon="add" onPress={openAdd} />} />
    <View style={styles.dateSwitch}><IconButton icon="chevron-back" onPress={() => setOffset(value => Math.min(30, value + 1))} /><Text style={styles.dateText}>{offset === 0 ? '今天' : offset === 1 ? '昨天' : dateLabel(selectedDate.toISOString())}</Text><IconButton icon="chevron-forward" onPress={() => setOffset(value => Math.max(0, value - 1))} color={offset === 0 ? C.faint : C.text} /></View>
    <Card style={styles.calorieCard}><View style={{ flex: 1 }}><Text style={styles.calorieLabel}>{offset === 0 ? '今日摄入' : '当日摄入'}</Text><Text style={styles.calorie}>{sum('calories')} <Text style={styles.calorieUnit}>千卡</Text></Text><Text style={styles.calorieHint}>手动记录，按包装或实际食材数据填写</Text></View><Ionicons name="nutrition-outline" size={34} color={C.accent} /></Card>
    <Card style={styles.macroCard}><Metric value={`${sum('protein')}g`} label="蛋白质" accent /><Metric value={`${sum('carbs')}g`} label="碳水" /><Metric value={`${sum('fat')}g`} label="脂肪" /></Card>
    <SectionTitle title={offset === 0 ? '今天吃了什么' : '当天吃了什么'} action="新增" onAction={openAdd} />
    {entries.length ? meals.map(mealName => {
      const mealEntries = entries.filter(entry => entry.meal === mealName);
      if (!mealEntries.length) return null;
      return <View key={mealName} style={{ gap: 9 }}><Text style={styles.mealTitle}>{mealName}</Text>{mealEntries.map(entry => <Card key={entry.id} style={styles.entry}><View style={styles.foodIcon}><Ionicons name="restaurant-outline" size={19} color={C.accent} /></View><View style={{ flex: 1 }}><Text style={styles.foodName}>{entry.name}</Text><Text style={styles.foodMeta}>{entry.portion} · 蛋白 {entry.protein}g · 碳水 {entry.carbs}g · 脂肪 {entry.fat}g</Text></View><View style={{ alignItems: 'flex-end', gap: 8 }}><Text style={styles.foodCalories}>{entry.calories}</Text><Pressable onPress={() => Alert.alert('删除饮食记录', `确定删除“${entry.name}”？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteFoodEntry(entry.id) }])} hitSlop={8}><Ionicons name="trash-outline" size={16} color={C.faint} /></Pressable></View></Card>)}</View>;
    }) : <Empty icon="nutrition-outline" title="当天没有饮食记录" subtitle="记录每餐营养，了解自己的摄入情况" />}
    <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}><SafeAreaView style={styles.modal} edges={['top', 'bottom']}><View style={styles.modalHeader}><Text style={styles.modalTitle}>添加食物</Text><IconButton icon="close" onPress={() => setModal(false)} /></View><Page style={{ flex: 1 }}><View style={styles.mealFilters}>{meals.map(item => <Badge key={item} label={item} active={meal === item} onPress={() => setMeal(item)} />)}</View><Field label="食物名称" value={name} onChangeText={setName} placeholder="例如：鸡胸肉" /><Field label="份量" value={portion} onChangeText={setPortion} placeholder="例如：150g" /><Field label="热量 · 千卡" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" placeholder="例如：165" /><View style={styles.macroFields}><View style={{ flex: 1 }}><Field label="蛋白质 · g" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="0" /></View><View style={{ flex: 1 }}><Field label="碳水 · g" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" placeholder="0" /></View><View style={{ flex: 1 }}><Field label="脂肪 · g" value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="0" /></View></View><Button label="保存食物" onPress={save} /></Page></SafeAreaView></Modal>
  </Page>;
}

const styles = StyleSheet.create({
  back: { marginTop: 12 }, calorieCard: { backgroundColor: '#253B1D', flexDirection: 'row', alignItems: 'center', minHeight: 140 }, calorieLabel: { color: '#B6CCA9', fontSize: 13 }, calorie: { color: C.text, fontSize: 38, fontWeight: '800', marginTop: 7 }, calorieUnit: { fontSize: 15, fontWeight: '600' }, calorieHint: { color: '#B6CCA9', fontSize: 11, marginTop: 6 }, macroCard: { flexDirection: 'row', gap: 8 }, mealTitle: { color: C.muted, fontWeight: '700', fontSize: 13 },
  dateSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }, dateText: { color: C.text, minWidth: 100, textAlign: 'center', fontWeight: '700', fontSize: 14 },
  entry: { flexDirection: 'row', gap: 11, alignItems: 'center' }, foodIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, foodName: { color: C.text, fontWeight: '700', fontSize: 14 }, foodMeta: { color: C.muted, fontSize: 10, marginTop: 5, lineHeight: 15 }, foodCalories: { color: C.accent, fontSize: 15, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: C.bg }, modalHeader: { paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: C.text, fontSize: 24, fontWeight: '800' }, mealFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, macroFields: { flexDirection: 'row', gap: 8 },
});
