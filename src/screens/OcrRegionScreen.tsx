import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Button, StyleSheet, Image, useWindowDimensions, ActivityIndicator, Alert, ScrollView, PanResponder } from 'react-native';
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
// - Kéo thân khung để di chuyển, kéo tay nắm góc để resize, chạm để chọn/đặt.
// - Nút ◀▲▼▶/W/H bên dưới để chỉnh tinh. Lưu dạng fraction 0..1.
type Target = 'q' | 0 | 1 | 2 | 3;

const DEFAULT_Q: FractionRegion = { fx: 0.08, fy: 0.18, fw: 0.84, fh: 0.16 };
const HANDLE_PX = 30;
const TAP_SLOP_PX = 8;

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

  const applyTo = (t: Target, f: FractionRegion) => {
    const c = clamp(f);
    if (t === 'q') setQ(c);
    else setAnswers((prev) => prev.map((v, i) => (i === t ? c : v)));
  };
  const apply = (f: FractionRegion) => applyTo(target, f);
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

  const gesture = useBoxGesture(DW, DH, q, answers, target, setTarget, applyTo);

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
      <Text style={styles.note}>Cách nhanh: mở game → chạm bubble 🤖 → "🎯 Vùng đọc". Trên ảnh: chạm khung để chọn · kéo thân để di chuyển · kéo núm tròn góc để resize · chạm nền để đặt khung đang chọn.</Text>
      <Button title={loading ? 'ĐANG CHỤP…' : shot ? 'Chụp preview lại' : 'Chụp preview'} onPress={snap} disabled={loading} />
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {shot ? (
        <View style={{ width: DW, height: DH, marginTop: 12, backgroundColor: '#000' }} {...gesture.panHandlers}>
          <Image source={{ uri: 'file://' + shot.uri }} style={{ width: DW, height: DH }} resizeMode="stretch" />
          {boxStyle(q, '#22c55e', target === 'q') ? (
            <View style={boxStyle(q, '#22c55e', target === 'q')!} pointerEvents="none">
              <Text style={styles.tag}>Q</Text>
              <View style={[styles.handle, { backgroundColor: '#22c55e' }]} />
            </View>
          ) : null}
          {answers.map((a, i) => {
            const s = boxStyle(a, '#3b82f6', target === i);
            return s ? (
              <View key={i} style={s} pointerEvents="none">
                <Text style={styles.tag}>{i}</Text>
                <View style={[styles.handle, { backgroundColor: '#3b82f6' }]} />
              </View>
            ) : null;
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
          <Text style={styles.h}>Chỉnh tinh</Text>
          <View style={styles.row}>
            <Text style={styles.btn} onPress={() => nudge(-0.01, 0)}>◀</Text>
            <Text style={styles.btn} onPress={() => nudge(0, -0.01)}>▲</Text>
            <Text style={styles.btn} onPress={() => nudge(0, 0.01)}>▼</Text>
            <Text style={styles.btn} onPress={() => nudge(0.01, 0)}>▶</Text>
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

type Gesture =
  | { kind: 'move' | 'resize'; target: Target; start: FractionRegion; x0: number; y0: number; moved: boolean }
  | { kind: 'tap'; x0: number; y0: number; moved: boolean }
  | null;

/** Kéo-thả/resize trực tiếp trên ảnh preview. Dùng ref để không kẹt closure cũ. */
function useBoxGesture(
  DW: number,
  DH: number,
  q: FractionRegion,
  answers: (FractionRegion | null)[],
  target: Target,
  setTarget: (t: Target) => void,
  applyTo: (t: Target, f: FractionRegion) => void,
) {
  const live = useRef({ DW, DH, q, answers, target });
  live.current = { DW, DH, q, answers, target };
  const applyRef = useRef(applyTo);
  applyRef.current = applyTo;
  const setTargetRef = useRef(setTarget);
  setTargetRef.current = setTarget;
  const g = useRef<Gesture>(null);

  const allBoxes = (): { t: Target; f: FractionRegion }[] => {
    const { q: qq, answers: aa, target: tt } = live.current;
    const list: { t: Target; f: FractionRegion }[] = [{ t: 'q', f: qq }];
    aa.forEach((a, i) => {
      if (a) list.push({ t: i as Target, f: a });
    });
    // Ưu tiên khung đang chọn khi hit-test chồng lấn.
    list.sort((a, b) => (a.t === tt ? -1 : 0) - (b.t === tt ? -1 : 0));
    return list;
  };

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { DW: w, DH: h } = live.current;
          const px = e.nativeEvent.locationX ?? 0;
          const py = e.nativeEvent.locationY ?? 0;
          const fx = w > 0 ? px / w : 0;
          const fy = h > 0 ? py / h : 0;
          const hx = HANDLE_PX / Math.max(1, w);
          const hy = HANDLE_PX / Math.max(1, h);
          for (const { t, f } of allBoxes()) {
            const inHandle =
              fx >= f.fx + f.fw - hx && fx <= f.fx + f.fw + hx &&
              fy >= f.fy + f.fh - hy && fy <= f.fy + f.fh + hy;
            if (inHandle) {
              g.current = { kind: 'resize', target: t, start: { ...f }, x0: px, y0: py, moved: false };
              setTargetRef.current(t);
              return;
            }
            if (fx >= f.fx && fx <= f.fx + f.fw && fy >= f.fy && fy <= f.fy + f.fh) {
              g.current = { kind: 'move', target: t, start: { ...f }, x0: px, y0: py, moved: false };
              setTargetRef.current(t);
              return;
            }
          }
          g.current = { kind: 'tap', x0: px, y0: py, moved: false };
        },
        onPanResponderMove: (e) => {
          const cur = g.current;
          if (!cur || cur.kind === 'tap') {
            if (cur) {
              const dx = e.nativeEvent.locationX - cur.x0;
              const dy = e.nativeEvent.locationY - cur.y0;
              if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) cur.moved = true;
            }
            return;
          }
          const { DW: w, DH: h } = live.current;
          const dx = (e.nativeEvent.locationX - cur.x0) / Math.max(1, w);
          const dy = (e.nativeEvent.locationY - cur.y0) / Math.max(1, h);
          if (Math.abs(e.nativeEvent.locationX - cur.x0) > TAP_SLOP_PX || Math.abs(e.nativeEvent.locationY - cur.y0) > TAP_SLOP_PX) {
            cur.moved = true;
          }
          if (cur.kind === 'move') {
            applyRef.current(cur.target, { ...cur.start, fx: cur.start.fx + dx, fy: cur.start.fy + dy });
          } else {
            applyRef.current(cur.target, { ...cur.start, fw: cur.start.fw + dx, fh: cur.start.fh + dy });
          }
        },
        onPanResponderRelease: (e) => {
          const cur = g.current;
          g.current = null;
          if (!cur) return;
          const { DW: w, DH: h } = live.current;
          const dx = e.nativeEvent.locationX - cur.x0;
          const dy = e.nativeEvent.locationY - cur.y0;
          const tapped = !cur.moved && dx * dx + dy * dy <= TAP_SLOP_PX * TAP_SLOP_PX;
          if (!tapped) return;
          // Chạm nhanh không kéo: đặt tâm khung ĐANG CHỌN vào điểm chạm.
          const tt = live.current.target;
          const box = tt === 'q' ? live.current.q : live.current.answers[tt];
          const base = box ?? { fx: 0, fy: 0, fw: 0.8, fh: 0.1 };
          applyRef.current(tt, {
            ...base,
            fx: e.nativeEvent.locationX / Math.max(1, w) - base.fw / 2,
            fy: e.nativeEvent.locationY / Math.max(1, h) - base.fh / 2,
          });
        },
        onPanResponderTerminate: () => {
          g.current = null;
        },
      }),
    [],
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
  tag: { position: 'absolute', top: -10, left: 2, fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: '#00000088', paddingHorizontal: 4, borderRadius: 4 },
  handle: { position: 'absolute', right: -8, bottom: -8, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
});
