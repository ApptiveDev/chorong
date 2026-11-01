import { Stack } from 'expo-router';
export default function IntegrationLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: '뒤로' }}>
      <Stack.Screen name="index" options={{ title: '기능 테스트' }} />
      <Stack.Screen name="account" options={{ title: '계정 관리' }} />
      <Stack.Screen name="learning" options={{ title: '학습' }} />
      <Stack.Screen name="review" options={{ title: '복습' }} />
      <Stack.Screen name="onboarding" options={{ title: '온보딩' }} />
      <Stack.Screen name="social" options={{ title: '소셜' }} />
      <Stack.Screen name="profile" options={{ title: '마이페이지' }} />
      <Stack.Screen name="housing" options={{ title: '하우징·상점' }} />
      <Stack.Screen name="diagnostics" options={{ title: 'API 테스트 기록' }} />
    </Stack>
  );
}
