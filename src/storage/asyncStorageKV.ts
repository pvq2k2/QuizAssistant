// AsyncStorage adapter cho KeyValue — dùng thật trên device (Expo Go OK).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValue } from './QuestionStorage';

export class AsyncStorageKV implements KeyValue {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }
}
