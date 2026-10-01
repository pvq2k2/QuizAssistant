import { createNavigationContainerRef } from '@react-navigation/native';

// Ref điều hướng toàn cục — để mở đúng tab khi bubble yêu cầu
// (native không navigate trực tiếp được).
export const navigationRef = createNavigationContainerRef();

export function navigateToTab(tab: 'Home' | 'Questions' | 'Settings'): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate(tab as never);
  }
}
