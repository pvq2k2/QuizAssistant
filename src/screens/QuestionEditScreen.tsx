import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store/AppStore';
import { isCorrectIndex } from '../models/types';
import type { CorrectIndex, QuizSetId } from '../models/types';

// §26: thêm/sửa — question + correctIndex 0-3. Sửa không đổi quizSetId (§43).
export function QuestionEditScreen({ route, navigation }: any) {
  const store = useAppStore();
  const quizSetId: QuizSetId = route?.params?.quizSetId ?? 'cathay';
  const questionId: string | undefined = route?.params?.questionId;
  const existing = questionId ? store.questions.find((q) => q.id === questionId) : undefined;

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [correctIndex, setCorrectIndex] = useState<CorrectIndex>(existing?.correctIndex ?? 2);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!question.trim()) {
      Alert.alert('Thiếu nội dung', 'Vui lòng nhập câu hỏi.');
      return;
    }
    if (!isCorrectIndex(correctIndex)) return;
    setSaving(true);
    try {
      if (existing) {
        await store.updateQuestion(existing.id, { question: question.trim(), correctIndex });
      } else {
        await store.addQuestion(quizSetId, question.trim(), correctIndex);
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>
        {existing ? 'Sửa câu hỏi' : 'Thêm câu hỏi'} ({quizSetId})
      </Text>
      <Text>Câu hỏi</Text>
      <TextInput style={styles.input} value={question} onChangeText={setQuestion} placeholder="Nhập câu hỏi…" multiline />
      <Text>Đáp án đúng</Text>
      {[0, 1, 2, 3].map((i) => (
        <Text key={i} onPress={() => setCorrectIndex(i as CorrectIndex)} style={styles.radio}>
          {correctIndex === i ? '●' : '○'} {i}
        </Text>
      ))}
      <Button title={saving ? 'ĐANG LƯU…' : 'Lưu'} onPress={save} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: theme.colors.background },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 8, minHeight: 80, marginBottom: 8 },
  radio: { fontSize: 18, paddingVertical: 4 },
});
