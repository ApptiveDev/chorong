import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { StyleSheet, View } from 'react-native';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
// Google 이 그리는 버튼의 고정 높이. 48 높이 버튼을 덮도록 세로로 늘린다.
const GOOGLE_BUTTON_HEIGHT = 40;
const TARGET_HEIGHT = 48;

// Google 로그인 버튼 위에 투명하게 겹친다. 웹은 idToken 을 Google 이 그린 버튼에서만 받을 수 있다.
export function GoogleButtonOverlay({
  width,
  disabled,
  onIdToken,
  onError,
}: {
  width: number;
  disabled: boolean;
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
}) {
  if (!webClientId) return null;
  return (
    <View
      pointerEvents={disabled ? 'none' : 'auto'}
      style={[s.overlay, { transform: [{ scaleY: TARGET_HEIGHT / GOOGLE_BUTTON_HEIGHT }] }]}
    >
      <GoogleOAuthProvider clientId={webClientId}>
        <GoogleLogin
          width={width}
          size="large"
          onSuccess={({ credential }) =>
            credential ? onIdToken(credential) : onError('Google 에서 인증 토큰을 받지 못했습니다.')
          }
          onError={() => onError('Google 로그인에 실패했습니다.')}
        />
      </GoogleOAuthProvider>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    opacity: 0.01,
    alignItems: 'center',
  },
});
