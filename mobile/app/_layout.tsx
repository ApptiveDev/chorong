import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/providers/AuthProvider';
import { WebFrame } from '../src/components/WebFrame';

export default function RootLayout() {
  return (
    <AuthProvider>
      <WebFrame>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings/profile" options={{ title: '프로필' }} />
          <Stack.Screen name="settings/my-info" options={{ title: '내 정보' }} />
          <Stack.Screen name="settings/contact" options={{ title: '고객 문의' }} />
          <Stack.Screen name="settings/app-info" options={{ title: '앱 정보' }} />
          <Stack.Screen name="settings/dev-tools" options={{ title: '개발자 도구' }} />
          <Stack.Screen name="+not-found" options={{ title: '없는 페이지' }} />
        </Stack>
        <StatusBar style="auto" />
      </WebFrame>
    </AuthProvider>
  );
}
