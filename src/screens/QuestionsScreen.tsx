import React, { useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, Alert } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store/AppStore';
import type { QuizSetId } from '../models/types';

// §25 + §35: 2 sub-tabs Cathay/Yamato, search trong bộ hiện tại, CRUD thật.
export function QuestionsScreen({ navigation }: any) {
  const store = useAppStore();
  const [setId, setSetId] = useState<QuizSetId>('cathay');
  const [keyword, setKeyword] = useState('');

  const kw = keyword.trim().toLowerCase();
  const items = store.questions.filter(
    (q) => q.quizSetId === setId && (!kw || q.question.toLowerCase().includes(kw)),
  );

  const confirmDelete = (id: string, preview: string) => {
    Alert.alert('Xóa câu hỏi?', preview, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => store.removeQuestion(id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Câu hỏi</Text>
      <View style={styles.row}>
        <Button
          title={`Cathay (${store.countCathay})`}
          onPress={() => setSetId('cathay')}
          color={setId === 'cathay' ? theme.colors.success : theme.colors.muted}
        />
        <Button
          title={`Yamato (${store.countYamato})`}
          onPress={() => setSetId('yamato')}
          color={setId === 'yamato' ? theme.colors.success : theme.colors.muted}
        />
      </View>
      <TextInput style={styles.input} placeholder="🔍 Tìm kiếm câu hỏi..." value={keyword} onChangeText={setKeyword} />
      {!store.ready ? (
        <Text>Đang tải…</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={<Text style={styles.empty}>Chưa có câu hỏi trong bộ này.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.q}>{item.question}</Text>
              <Text>Đáp án: {item.correctIndex}</Text>
              <View style={styles.cardRow}>
                <Button
                  title="✏ Sửa"
                  onPress={() => navigation.navigate('QuestionEdit', { quizSetId: setId, questionId: item.id })}
                />
                <Button title="🗑 Xóa" color={theme.colors.error} onPress={() => confirmDelete(item.id, item.question)} />
              </View>
            </View>
          )}
        />
      )}
      <Button title="＋ Thêm câu hỏi" onPress={() => navigation.navigate('QuestionEdit', { quizSetId: setId })} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: theme.colors.background },
  title: { fontSize: 20, fontWeight: 'bold' },
  row: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 8, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, marginBottom: 8 },
  q: { fontWeight: '600', marginBottom: 4 },
  cardRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 24 },
});
