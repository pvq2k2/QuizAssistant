import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppStoreProvider } from './src/store/AppStore';
import { navigateToTab, navigationRef } from './src/navigation/navigationRef';
import { getLaunchTab, isNativeCaptureAvailable } from './src/services/realScan';

// Khi bubble yêu cầu mở tab (📚/⚙/🎯), native gắn extra "quiz_tab" vào intent.
// Poll mỗi khi app active để điều hướng đúng tab.
function useBubbleDeepLink() {
  useEffect(() => {
    if (!isNativeCaptureAvailable()) return;
    let alive = true;
    const check = async () => {
      try {
        const tab = await getLaunchTab();
        if (!alive || !tab) return;
        if (tab === 'Questions' || tab === 'Settings' || tab === 'Home') {
          navigateToTab(tab);
        } else if (tab === 'Region') {
          // Mở thẳng màn hình cấu hình vùng đọc (bubble đã chụp nền game).
          if (navigationRef.isReady()) {
            navigationRef.navigate('Settings' as never, { screen: 'OcrRegion' } as never);
          }
        }
      } catch {}
    };
    check().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check().catch(() => {});
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
}

function DeepLinkHandler() {
  useBubbleDeepLink();
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppStoreProvider>
        <DeepLinkHandler />
        <RootNavigator />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
