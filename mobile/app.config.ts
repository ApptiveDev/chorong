import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json 을 기본으로 두고 환경마다 달라지는 값만 여기서 덧붙인다.
// Google 로그인 iOS URL scheme 은 iOS 클라이언트 ID 를 뒤집은 값이다. 클라이언트 ID 가 없으면 플러그인을 넣지 않는다.
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const plugins = [...(config.plugins ?? [])];
  if (iosClientId) {
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }
  return { ...config, name: config.name ?? 'chorong', slug: config.slug ?? 'chorong', plugins };
};
