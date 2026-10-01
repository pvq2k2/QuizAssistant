import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { theme } from '../theme';

// §28: Overlay cấu hình Q + 4 vùng đáp án 0-3 (drag/resize) — implement native ở P3.
// Màn RN này là entry + hướng dẫn + nút Lưu/Test; overlay thật thuộc RegionOverlayView (native).
export function OcrRegionScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>CẤU HÌNH VÙNG OCR</Text>
      <Text>[ Q ] Vùng câu hỏi (bắt buộc)</Text>
      <Text>[ 0 ] Vùng đáp án 0</Text>
      <Text>[ 1 ] Vùng đáp án 1</Text>
      <Text>[ 2 ] Vùng đáp án 2</Text>
      <Text>[ 3 ] Vùng đáp án 3</Text>
      <Text style={styles.note}>Mỗi region kéo + resize được, có label, không nhầm index. Native overlay ở P3.</Text>
      <Button title="Test OCR" onPress={() => {}} />
      <View style={styles.gap} />
      <Button title="Lưu" onPress={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 4, backgroundColor: theme.colors.background },
  title: { fontSize: 18, fontWeight: 'bold' },
  note: { marginVertical: 8, color: theme.colors.muted },
  gap: { height: 8 },
});
