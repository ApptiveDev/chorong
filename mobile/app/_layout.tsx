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
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen name="preview" options={{ title: 'UI 미리보기' }} />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="review" options={{ title: '복습' }} />
          <Stack.Screen name="onboarding" options={{ title: '시작 안내' }} />
          <Stack.Screen name="learn/course/[courseId]" options={{ title: '코스' }} />
          <Stack.Screen name="learn/lesson/[lessonId]" options={{ title: '레슨' }} />
          <Stack.Screen name="learn/study/[lessonId]" options={{ headerShown: false }} />
          <Stack.Screen name="room/[mode]" options={{ headerShown: false }} />
          <Stack.Screen name="social/[housingId]" options={{ title: '다른 우주' }} />
          <Stack.Screen name="integration" options={{ headerShown: false }} />
          <Stack.Screen name="settings/profile" options={{ title: '프로필' }} />
          <Stack.Screen name="settings/my-info" options={{ title: '내 정보' }} />
          <Stack.Screen name="settings/contact" options={{ headerShown: false }} />
          <Stack.Screen name="settings/universe" options={{ headerShown: false }} />
          <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
          <Stack.Screen name="settings/blocked" options={{ headerShown: false }} />
          <Stack.Screen name="settings/terms" options={{ headerShown: false }} />
          <Stack.Screen name="settings/privacy" options={{ headerShown: false }} />
          <Stack.Screen name="settings/delete-request" options={{ headerShown: false }} />
          <Stack.Screen name="settings/app-info" options={{ title: '앱 정보' }} />
          <Stack.Screen name="settings/dev-tools" options={{ title: '개발자 도구' }} />
          <Stack.Screen name="+not-found" options={{ title: '없는 페이지' }} />
        </Stack>
        <StatusBar style="auto" />
      </WebFrame>
    </AuthProvider>
  );
}
