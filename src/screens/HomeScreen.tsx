import React, { useState } from 'react';
import { View, Text, Button, TextInput, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store/AppStore';
import { captureAndOcr, isNativeCaptureAvailable } from '../services/realScan';
import type { AssistantStatus } from '../models/types';

// §22 Tab Trang chủ (§41): trạng thái + Bật/Tắt + Quét + bộ hiện tại + số câu.
// "QUÉT" dùng text nhập tay (chạy cả Expo Go). "QUÉT MÀN HÌNH THẬT" chỉ hiện
// trên dev-build: chụp màn hình thật qua MediaProjection + OCR ML Kit.
export function HomeScreen({ navigation }: any) {
  const store = useAppStore();
  const [ocrText, setOcrText] = useState('Ẩm thực Tứ Xuyên nổi tiếng với _____?');
  const [status, setStatus] = useState<AssistantStatus>('IDLE');
  const [result, setResult] = useState<string>('');
  const [scanning, setScanning] = useState(false);

  if (!store.ready) {
    return (
      <View style={styles.root}>
        <Text>Đang tải dữ liệu…</Text>
      </View>
    );
  }

  const finishTypedScan = (text: string) => {
    setStatus('MATCHING');
    const r = store.scan(text, store.selectedSet);
    if (r.matched) {
      setStatus('ANSWER_FOUND');
      const n = store.questions.filter((q) => q.quizSetId === store.selectedSet).length;
      setResult(`Đáp án: ${r.correctIndex} (tìm trong ${n} câu ${store.selectedSet})`);
    } else {
      setStatus('NOT_FOUND');
      setResult(`Không tìm thấy trong bộ ${store.selectedSet}.\nnormalized: "${r.normalized}"`);
    }
    setScanning(false);
  };

  const scan = () => {
    if (!ocrText.trim() || scanning) return;
    setScanning(true);
    setResult('');
    setStatus('CAPTURING');
    // Pipeline typed-text: CAPTURING → OCR_PROCESSING → MATCHING.
    setTimeout(() => {
      setStatus('OCR_PROCESSING');
      setTimeout(() => finishTypedScan(ocrText), 60);
    }, 60);
  };

  // Pipeline thật (dev-build): CAPTURING → OCR native → MATCHING (substring).
  const scanReal = async () => {
    if (scanning) return;
    setScanning(true);
    setResult('');
    try {
      setStatus('CAPTURING');
      const shot = await captureAndOcr();
      setStatus('OCR_PROCESSING');
      setStatus('MATCHING');
      const r = store.scanFullText(shot.text, store.selectedSet);
      if (!shot.text.trim()) {
        setStatus('NOT_FOUND');
        setResult('OCR không đọc được chữ nào trên màn hình. Thử mở game rồi quét lại.');
      } else if (r.matched) {
        setStatus('ANSWER_FOUND');
        setResult(`Đáp án: ${r.correctIndex}\nOCR: "${shot.text.slice(0, 200)}"`);
      } else {
        setStatus('NOT_FOUND');
        setResult(`Không tìm thấy trong bộ ${store.selectedSet}.\nOCR: "${shot.text.slice(0, 200)}"`);
      }
    } catch (e: any) {
      setStatus('ERROR');
      setResult(e?.message ?? 'Quét thất bại.');
    } finally {
      setScanning(false);
    }
  };

  const statusColor =
    status === 'ANSWER_FOUND' ? theme.colors.success : status === 'NOT_FOUND' || status === 'ERROR' ? theme.colors.error : theme.colors.text;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <Text style={styles.title}>QuizAssistant</Text>
      <Text>
        Assistant: {store.enabled ? '● Đang bật' : '● Đang tắt'}
      </Text>
      <Text>Bộ câu hỏi: {store.selectedSet === 'cathay' ? '📚 Snail Quiz - Cathay' : '📚 Snail Quiz - Yamato'}</Text>
      <Text>
        Đã lưu: {store.countCathay} Cathay · {store.countYamato} Yamato
      </Text>
      <Text style={{ color: statusColor }}>Trạng thái: {status}</Text>
      <Button title={store.enabled ? 'TẮT ASSISTANT' : 'BẬT ASSISTANT'} onPress={() => store.setEnabled(!store.enabled)} />
      <View style={styles.gap} />
      <View style={styles.row}>
        <Button title="Cathay" onPress={() => store.setSelectedSet('cathay')} color={store.selectedSet === 'cathay' ? theme.colors.success : theme.colors.muted} />
        <Button title="Yamato" onPress={() => store.setSelectedSet('yamato')} color={store.selectedSet === 'yamato' ? theme.colors.success : theme.colors.muted} />
      </View>
      <Text style={styles.h}>🔍 Quét câu hỏi (nhập text OCR)</Text>
      <TextInput style={styles.input} value={ocrText} onChangeText={setOcrText} placeholder="Dán text OCR ở đây…" multiline />
      <Button title={scanning ? 'ĐANG QUÉT…' : 'QUÉT'} onPress={scan} disabled={scanning} />
      {isNativeCaptureAvailable() ? (
        <>
          <View style={styles.gap} />
          <Button
            title={scanning ? 'ĐANG CHỤP…' : '📸 QUÉT MÀN HÌNH THẬT'}
            onPress={scanReal}
            disabled={scanning}
            color={theme.colors.success}
          />
          <Text style={styles.hint}>Chụp màn hình hiện tại của máy (kể cả game/app khác) rồi OCR thật.</Text>
        </>
      ) : null}
      {result ? <Text style={styles.result}>{result}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  body: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  h: { marginTop: 12, fontWeight: 'bold' },
  gap: { height: 8 },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 8, minHeight: 70 },
  result: { marginTop: 8, fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  hint: { color: theme.colors.muted, fontSize: 12 },
});
