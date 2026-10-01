import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { QuestionsScreen } from '../screens/QuestionsScreen';
import { QuestionEditScreen } from '../screens/QuestionEditScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { OcrRegionScreen } from '../screens/OcrRegionScreen';
import { navigationRef } from './navigationRef';

// §29: Root → BottomTab(3 tabs) → Stacks. Screens phụ không lên bottom tab.
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const QuestionsStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

function HomeStackNav() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{ title: 'Trang chủ' }} />
    </HomeStack.Navigator>
  );
}

function QuestionsStackNav() {
  return (
    <QuestionsStack.Navigator>
      <QuestionsStack.Screen name="QuestionsMain" component={QuestionsScreen} options={{ title: 'Câu hỏi' }} />
      <QuestionsStack.Screen name="QuestionEdit" component={QuestionEditScreen} options={{ title: 'Thêm / Sửa' }} />
    </QuestionsStack.Navigator>
  );
}

function SettingsStackNav() {
  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Cài đặt' }} />
      <SettingsStack.Screen name="OcrRegion" component={OcrRegionScreen} options={{ title: 'Cấu hình vùng đọc' }} />
    </SettingsStack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home" component={HomeStackNav} options={{ title: 'Trang chủ' }} />
        <Tab.Screen name="Questions" component={QuestionsStackNav} options={{ title: 'Câu hỏi' }} />
        <Tab.Screen name="Settings" component={SettingsStackNav} options={{ title: 'Cài đặt' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
