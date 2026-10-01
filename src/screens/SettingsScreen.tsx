import React, { useState } from 'react';
import { View, Text, Button, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import { theme } from '../theme';
import { CLICK_DELAY_OPTIONS } from '../models/types';
import { useAppStore } from '../store/AppStore';
import { captureAndOcr, isNativeCaptureAvailable } from '../services/realScan';
import type { QuizSetId } from '../models/types';

// §27 + §42: persist autoMode/clickDelay/bộ mặc định + Test OCR + import/export JSON (§16).
export function SettingsScreen({ navigation }: any) {
  const store = useAppStore();
  const [testText, setTestText] = useState('Ẩm thực Tứ Xuyên nổi tiếng với _____?');
  const [testOut, setTestOut] = useState('');
  const [testing, setTesting] = useState(false);
  const [importText, setImportText] = useState('');
  const [showExport, setShowExport] = useState(false);

  const runTest = () => {
    const r = store.scan(testText, store.selectedSet);
    setTestOut(
      r.matched
        ? `OCR: "${r.ocrText}"\nnormalized: "${r.normalized}"\nMatched: YES\nCorrect index: ${r.correctIndex}`
        : `OCR: "${r.ocrText}"\nnormalized: "${r.normalized}"\nMatched: NO\nCorrect index: null`,
    );
  };

  // Test OCR thật (§15): capture → OCR → hiển thị text + matched + index.
  const runRealTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const shot = await captureAndOcr();
      const r = store.scanFullText(shot.text, store.selectedSet);
      setTestOut(
        `OCR result:\n\n${shot.text || '(trống)'}\n\nMatched: ${r.matched ? 'YES' : 'NO'}\nCorrect index: ${r.matched ? r.correctIndex : 'null'}`,
      );
    } catch (e: any) {
      setTestOut(`Lỗi: ${e?.message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  const doImport = async () => {
    if (!importText.trim()) {
      Alert.alert('Trống', 'Dán JSON cần import vào ô trên.');
      return;
    }
    const r = await store.importJson(importText);
    if (r.error) Alert.alert('Lỗi', r.error);
    else {
      Alert.alert('Xong', `Đã import ${r.ok} câu.`);
      setImportText('');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <Text style={styles.title}>Cài đặt</Text>

      <Text style={styles.h}>Bộ câu hỏi mặc định</Text>
      <View style={styles.row}>
        <Button
          title="Cathay"
          onPress={() => store.setSelectedSet('cathay')}
          color={store.selectedSet === 'cathay' ? theme.colors.success : theme.colors.muted}
        />
        <Button
          title="Yamato"
          onPress={() => store.setSelectedSet('yamato')}
          color={store.selectedSet === 'yamato' ? theme.colors.success : theme.colors.muted}
        />
      </View>

      <Text style={styles.h}>Assistant</Text>
      <Text>Auto Mode: {store.autoMode ? 'ON' : 'OFF'} (cần dev-build mới click thật)</Text>
      <Button title="Toggle Auto Mode" onPress={() => store.setAutoMode(!store.autoMode)} />
      <Text style={styles.mt}>Độ trễ click: {store.clickDelayMs}ms</Text>
      <View style={styles.row}>
        {CLICK_DELAY_OPTIONS.map((d) => (
          <Text key={d} onPress={() => store.setClickDelayMs(d)} style={[styles.chip, store.clickDelayMs === d && styles.chipActive]}>
            {d}
          </Text>
        ))}
      </View>

      <Text style={styles.h}>OCR</Text>
      <Button title="Cấu hình vùng đọc" onPress={() => navigation.navigate('OcrRegion')} />
      <View style={styles.gap} />
      <Text>Test OCR trên bộ {store.selectedSet}:</Text>
      <TextInput style={styles.input} value={testText} onChangeText={setTestText} multiline placeholder="Text OCR…" />
      <Button title="Test OCR" onPress={runTest} />
      {isNativeCaptureAvailable() ? (
        <>
          <View style={styles.gap} />
          <Button
            title={testing ? 'ĐANG CHỤP…' : '📸 Test OCR màn hình thật'}
            onPress={runRealTest}
            disabled={testing}
            color={theme.colors.success}
          />
        </>
      ) : null}
      {testOut ? <Text style={styles.mono}>{testOut}</Text> : null}

      <Text style={styles.h}>Dữ liệu (§16)</Text>
      <Button title={showExport ? 'Ẩn export' : 'Xem export JSON'} onPress={() => setShowExport((v) => !v)} />
      {showExport ? <Text style={styles.mono} selectable>{store.exportJson('all')}</Text> : null}
      <Text style={styles.mt}>Import JSON (hỗ trợ 1 object hoặc array, mỗi item có quizSetId/question/correctIndex):</Text>
      <TextInput style={[styles.input, { minHeight: 90 }]} value={importText} onChangeText={setImportText} multiline placeholder='[{"quizSetId":"cathay","question":"…","correctIndex":2}]' />
      <Button title="Import" onPress={doImport} />
      <SetPickerHint setId={store.selectedSet} />
    </ScrollView>
  );
}

function SetPickerHint({ setId }: { setId: QuizSetId }) {
  return <Text style={{ color: '#9ca3af', marginTop: 12 }}>Import không cần đúng bộ đang chọn ({setId}) — mỗi item tự mang quizSetId.</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  body: { padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  h: { marginTop: 16, fontWeight: 'bold' },
  mt: { marginTop: 8 },
  gap: { height: 8 },
  row: { flexDirection: 'row', gap: 8, marginVertical: 8, flexWrap: 'wrap' },
  chip: { padding: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8 },
  chipActive: { backgroundColor: theme.colors.success, color: '#fff' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 8, minHeight: 60, marginVertical: 8 },
  mono: { fontFamily: 'monospace', fontSize: 12, marginTop: 8, backgroundColor: '#f3f4f6', padding: 8, borderRadius: 8 },
});
