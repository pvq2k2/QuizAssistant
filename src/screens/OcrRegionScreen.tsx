import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, Image, useWindowDimensions, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { theme } from '../theme';
import {
  isNativeCaptureAvailable,
  capturePreview,
  getLastShot,
  getQuestionRegion,
  setQuestionRegion,
  getAnswerRegions,
  setAnswerRegion,
} from '../services/realScan';
import type { FractionRegion } from '../services/realScan';

// §28: Editor vùng đọc trực quan (dev-build).
// Chụp preview màn hình thật → kéo khung Q / 0-3 bằng nút nudge → lưu fraction.
// Cần mở game trước rồi mới vào màn hình này bấm "Chụp preview".
type Target = 'q' | 0 | 1 | 2 | 3;

const DEFAULT_Q: FractionRegion = { fx: 0.08, fy: 0.18, fw: 0.84, fh: 0.16 };

export function OcrRegionScreen() {
  const { width: winW } = useWindowDimensions();
  const [shot, setShot] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<Target>('q');
  const [q, setQ] = useState<FractionRegion>(DEFAULT_Q);
  const [answers, setAnswers] = useState<(FractionRegion | null)[]>([null, null, null, null]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNativeCaptureAvailable()) return;
    (async () => {
      try {
        const rq = await getQuestionRegion();
        if (rq) setQ(rq);
        setAnswers(await getAnswerRegions());
        // Bubble "🎯 Vùng đọc" chụp nền game trước rồi mở màn này:
        // tự nạp ảnh đó làm nền, khỏi bấm "Chụp preview".
        const last = await getLastShot().catch(() => null);
        if (last) setShot(last);
      } catch {}
    })();
  }, []);

  if (!isNativeCaptureAvailable()) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>CẤU HÌNH VÙNG OCR</Text>
        <Text style={styles.note}>Editor cần dev-build Android (phải chụp màn hình thật để làm nền). Trên Expo Go chưa dùng được.</Text>
      </View>
    );
  }

  const snap = async () => {
    setLoading(true);
    try {
      setShot(await capturePreview());
    } catch (e: any) {
      Alert.alert('Chụp thất bại', e?.message ?? '');
    } finally {
      setLoading(false);
    }
  };

  const cur: FractionRegion | null = target === 'q' ? q : answers[target];
  const apply = (f: FractionRegion) => {
    const c = clamp(f);
    if (target === 'q') setQ(c);
    else setAnswers((prev) => prev.map((v, i) => (i === target ? c : v)));
  };
  const nudge = (dx: number, dy: number) => {
    if (!cur) return;
    apply({ ...cur, fx: cur.fx + dx, fy: cur.fy + dy });
  };
  const resize = (dw: number, dh: number) => {
    if (!cur) return;
    apply({ ...cur, fw: cur.fw + dw, fh: cur.fh + dh });
  };

  const save = async () => {
    setSaving(true);
    try {
      await setQuestionRegion(q);
      for (let i = 0; i < 4; i++) {
        const a = answers[i];
        if (a) await setAnswerRegion(i, a);
      }
      Alert.alert('Đã lưu', 'Vùng câu hỏi + vùng đáp án đã lưu. Bubble sẽ dùng ngay.');
    } catch (e: any) {
      Alert.alert('Lỗi lưu', e?.message ?? '');
    } finally {
      setSaving(false);
    }
  };

  const DW = winW - 32;
  const DH = shot ? DW * (shot.height / Math.max(1, shot.width)) : 0;

  const boxStyle = (f: FractionRegion | null, color: string, active: boolean) =>
    f
      ? {
          position: 'absolute' as const,
          left: f.fx * DW,
          top: f.fy * DH,
          width: Math.max(8, f.fw * DW),
          height: Math.max(8, f.fh * DH),
          borderWidth: active ? 3 : 2,
          borderColor: color,
          backgroundColor: color + '33',
        }
      : null;

  const label = (t: Target) => (t === 'q' ? 'Q (câu hỏi)' : `Đáp án ${t}`);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>CẤU HÌNH VÙNG OCR</Text>
      <Text style={styles.note}>Cách nhanh: mở game → chạm bubble 🤖 → "🎯 Vùng đọc" (tự chụp nền game rồi mở màn này). Hoặc bấm "Chụp preview" dưới đây khi app đang mở.</Text>
      <Button title={loading ? 'ĐANG CHỤP…' : shot ? 'Chụp preview lại' : 'Chụp preview'} onPress={snap} disabled={loading} />
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {shot ? (
        <View
          style={{ width: DW, height: DH, marginTop: 12, backgroundColor: '#000' }}
          onTouchEnd={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            const base = cur ?? { fx: 0, fy: 0, fw: 0.8, fh: 0.1 };
            apply({
              ...base,
              fx: locationX / DW - base.fw / 2,
              fy: locationY / DH - base.fh / 2,
            });
          }}
        >
          <Image source={{ uri: 'file://' + shot.uri }} style={{ width: DW, height: DH }} resizeMode="stretch" />
          {boxStyle(q, '#22c55e', target === 'q') ? <View style={boxStyle(q, '#22c55e', target === 'q')!} pointerEvents="none" /> : null}
          {answers.map((a, i) => {
            const s = boxStyle(a, '#3b82f6', target === i);
            return s ? <View key={i} style={s} pointerEvents="none" /> : null;
          })}
        </View>
      ) : null}

      <Text style={styles.h}>Khung đang sửa</Text>
      <View style={styles.row}>
        {(['q', 0, 1, 2, 3] as Target[]).map((t) => (
          <Text key={String(t)} onPress={() => setTarget(t)} style={[styles.chip, target === t && styles.chipActive]}>
            {t === 'q' ? 'Q' : String(t)}
          </Text>
        ))}
      </View>
      <Text>
        {label(target)}: {cur ? `${pct(cur.fx)}, ${pct(cur.fy)}, ${pct(cur.fw)} × ${pct(cur.fh)}` : 'chưa đặt'}
      </Text>
      {!cur && target !== 'q' ? (
        <View style={{ marginTop: 8 }}>
          <Button title={`Đặt mặc định khung ${target}`} onPress={() => apply({ fx: 0.1, fy: 0.4 + target * 0.12, fw: 0.8, fh: 0.09 })} />
        </View>
      ) : null}

      {cur ? (
        <>
          <Text style={styles.h}>Dịch chuyển</Text>
          <View style={styles.row}>
            <Text style={styles.btn} onPress={() => nudge(-0.01, 0)}>◀</Text>
            <Text style={styles.btn} onPress={() => nudge(0, -0.01)}>▲</Text>
            <Text style={styles.btn} onPress={() => nudge(0, 0.01)}>▼</Text>
            <Text style={styles.btn} onPress={() => nudge(0.01, 0)}>▶</Text>
          </View>
          <Text style={styles.h}>Rộng / cao</Text>
          <View style={styles.row}>
            <Text style={styles.btn} onPress={() => resize(-0.01, 0)}>W−</Text>
            <Text style={styles.btn} onPress={() => resize(0.01, 0)}>W+</Text>
            <Text style={styles.btn} onPress={() => resize(0, -0.01)}>H−</Text>
            <Text style={styles.btn} onPress={() => resize(0, 0.01)}>H+</Text>
          </View>
        </>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Button title={saving ? 'ĐANG LƯU…' : 'Lưu tất cả vùng'} onPress={save} disabled={saving} />
      </View>
    </ScrollView>
  );
}

function clamp(f: FractionRegion): FractionRegion {
  const fw = Math.min(0.98, Math.max(0.02, f.fw));
  const fh = Math.min(0.98, Math.max(0.02, f.fh));
  return {
    fx: Math.min(0.98 - fw, Math.max(0, f.fx)),
    fy: Math.min(0.98 - fh, Math.max(0, f.fy)),
    fw,
    fh,
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 18, fontWeight: 'bold' },
  note: { marginVertical: 8, color: theme.colors.muted },
  h: { marginTop: 12, fontWeight: 'bold' },
  row: { flexDirection: 'row', gap: 8, marginVertical: 8, flexWrap: 'wrap', alignItems: 'center' },
  chip: { padding: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, overflow: 'hidden' },
  chipActive: { backgroundColor: theme.colors.success, color: '#fff' },
  btn: { padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, fontSize: 16, overflow: 'hidden' },
});
