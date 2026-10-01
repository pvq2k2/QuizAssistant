import React, { useEffect, useState } from 'react';
import { View, Text, Button, TextInput, StyleSheet, ScrollView, Alert, AppState } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store/AppStore';
import {
  captureAndOcr,
  isNativeCaptureAvailable,
  hasNativeMethod,
  canDrawOverlays,
  hasCaptureConsent,
  requestCaptureConsent,
  isAccessibilityConnected,
  openOverlaySettings,
  openAccessibilitySettings,
  getQuestionRegion,
  getAnswerRegions,
} from '../services/realScan';
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
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    store.refreshBubbleState().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const toggleAssistant = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      if (store.bubbleRunning) {
        await store.stopAssistant();
        setStatus('IDLE');
      } else {
        await store.startAssistant();
        setStatus('IDLE');
        setResult('Bubble 🤖 đã hiện. Mở game rồi chạm bubble để quét.');
      }
    } catch (e: any) {
      Alert.alert('Assistant', e?.message ?? 'Không bật được assistant.');
      store.refreshBubbleState().catch(() => {});
    } finally {
      setToggling(false);
    }
  };

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
      {isNativeCaptureAvailable() ? (
        <>
          <Text>Bubble: {store.bubbleRunning ? '🤖 đang hiện' : 'ẩn'}</Text>
          <Button
            title={toggling ? 'ĐANG XỬ LÝ…' : store.bubbleRunning ? 'TẮT ASSISTANT (ẨN BUBBLE)' : 'BẬT ASSISTANT (HIỆN BUBBLE)'}
            onPress={toggleAssistant}
            disabled={toggling}
          />
        </>
      ) : (
        <Button title={store.enabled ? 'TẮT ASSISTANT' : 'BẬT ASSISTANT'} onPress={() => store.setEnabled(!store.enabled)} />
      )}
      <View style={styles.gap} />
      <View style={styles.row}>
        <Button title="Cathay" onPress={() => store.setSelectedSet('cathay')} color={store.selectedSet === 'cathay' ? theme.colors.success : theme.colors.muted} />
        <Button title="Yamato" onPress={() => store.setSelectedSet('yamato')} color={store.selectedSet === 'yamato' ? theme.colors.success : theme.colors.muted} />
      </View>
      {isNativeCaptureAvailable() ? <PermissionCenter /> : <GoInstallNote />}
      <RegionStatus navigation={navigation} />
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
  permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
});

// §22: trạng thái các quyền cần thiết + nút xin từng quyền ngay tại Home.
// Luôn hiển thị (kể cả khi native thiếu) để user biết vì sao chưa chạy được.
function PermissionCenter() {
  const [st, setSt] = useState<{
    overlay: boolean | null;
    shot: boolean | null;
    notif: boolean | null;
    a11y: boolean | null;
  }>({ overlay: null, shot: null, notif: null, a11y: null });
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const [overlay, shot, a11y] = await Promise.all([
        canDrawOverlays(),
        hasCaptureConsent(),
        isAccessibilityConnected(),
      ]);
      setSt((s) => ({ ...s, overlay, shot, a11y }));
    } catch {
      setSt((s) => ({ ...s, overlay: false, shot: false, a11y: false }));
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh().catch(() => {});
    });
    return () => sub.remove();
  }, [refresh]);

  const ask = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert('Quyền', e?.message ?? 'Không xin được quyền.');
    } finally {
      setBusy(null);
      refresh().catch(() => {});
    }
  };

  const dot = (v: boolean | null) => (v === null ? '…' : v ? '✓' : '✗');
  const dotColor = (v: boolean | null) =>
    v ? theme.colors.success : v === null ? theme.colors.muted : theme.colors.error;

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.h}>Trạng thái quyền</Text>
        <Text onPress={refresh} style={{ marginTop: 12, color: theme.colors.success }}>
          ↻ Kiểm tra lại
        </Text>
      </View>
      <NativeCapsRow />
      <View style={styles.permRow}>
        <Text style={{ color: dotColor(st.overlay) }}>{dot(st.overlay)} Overlay (hiện bubble)</Text>
        <Button
          title={busy === 'overlay' ? '…' : st.overlay ? 'Mở cài đặt' : 'Xin quyền'}
          onPress={() => ask('overlay', openOverlaySettings)}
          disabled={busy !== null}
        />
      </View>
      <Text style={styles.hint}>Overlay phải bật thủ công trong màn hình hệ thống vừa mở.</Text>
      <View style={styles.permRow}>
        <Text style={{ color: dotColor(st.shot) }}>{dot(st.shot)} Chụp màn hình game</Text>
        <Button
          title={busy === 'shot' ? '…' : 'Xin quyền'}
          onPress={() =>
            ask('shot', async () => {
              const ok = await requestCaptureConsent();
              if (!ok) throw new Error('Bạn đã từ chối quyền chụp màn hình.');
            })
          }
          disabled={busy !== null}
        />
      </View>
      <View style={styles.permRow}>
        <Text>✓ OCR (ML Kit trong máy)</Text>
      </View>
      <View style={styles.permRow}>
        <Text style={{ color: dotColor(st.a11y) }}>{dot(st.a11y)} Accessibility (tự chạm)</Text>
        <Button
          title={busy === 'a11y' ? '…' : st.a11y ? 'Mở cài đặt' : 'Xin quyền'}
          onPress={() => ask('a11y', openAccessibilitySettings)}
          disabled={busy !== null}
        />
      </View>
      <Text style={styles.hint}>Accessibility cũng phải gạt bật thủ công trong màn hình hệ thống.</Text>
    </View>
  );
}

// Hiện khi chạy bản thiếu native (Expo Go / APK cũ): giải thích + hướng cài.
function GoInstallNote() {
  return (
    <View>
      <Text style={styles.h}>Trạng thái quyền</Text>
      <NativeCapsRow />
      <Text style={styles.hint}>
        Bạn đang chạy bản thiếu native (Expo Go hoặc APK cũ) nên chưa xin quyền / hiện bubble được. Hãy cài file
        app-release.apk mới nhất rồi mở lại app này.
      </Text>
    </View>
  );
}

// Phát hiện APK cũ (thiếu method bubble mới) để báo user cài bản mới.
function NativeCapsRow() {
  const ok =
    hasNativeMethod('startBubble') &&
    hasNativeMethod('assistantScan') &&
    hasNativeMethod('getLaunchTab');
  return (
    <View style={styles.permRow}>
      <Text style={{ color: ok ? theme.colors.success : theme.colors.error }}>
        {ok ? '✓ Native bubble (APK mới)' : '✗ Native bubble thiếu — hãy cài APK mới nhất'}
      </Text>
    </View>
  );
}

// Vùng đọc đã cấu hình chưa — nhắc cấu hình trước khi bật bubble.
function RegionStatus({ navigation }: any) {
  const [info, setInfo] = useState<string>('…');

  const refresh = React.useCallback(async () => {
    if (!isNativeCaptureAvailable()) {
      setInfo('Cần bản APK mới để cấu hình vùng đọc');
      return;
    }
    try {
      const q = await getQuestionRegion();
      const arr = await getAnswerRegions();
      const n = arr.filter(Boolean).length;
      setInfo(q ? `Vùng câu hỏi ✓ · Vùng đáp án ${n}/4` : `Vùng câu hỏi ✗ · Vùng đáp án ${n}/4`);
    } catch {
      setInfo('Không đọc được cấu hình');
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <View style={styles.permRow}>
      <Text>{info}</Text>
      <Button
        title="Cấu hình"
        disabled={!isNativeCaptureAvailable()}
        onPress={() => navigation.navigate('Settings', { screen: 'OcrRegion' })}
      />
    </View>
  );
}
