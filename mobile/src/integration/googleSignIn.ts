import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

// 백엔드는 idToken 의 aud 를 Web 클라이언트 ID 로 검증한다. 그래서 webClientId 를 꼭 넘긴다.
function configure() {
  if (configured) return;
  if (!webClientId) throw new Error('Google 로그인이 이 빌드에 설정되지 않았습니다.');
  GoogleSignin.configure({ webClientId, iosClientId });
  configured = true;
}

// 사용자가 취소하면 null 을 돌려준다.
export async function signInWithGoogle(): Promise<string | null> {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    const { idToken } = response.data;
    if (!idToken) throw new Error('Google 에서 인증 토큰을 받지 못했습니다.');
    return idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (error.code === statusCodes.IN_PROGRESS)
        throw new Error('Google 로그인이 이미 진행 중입니다.');
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play 서비스를 사용할 수 없는 기기입니다.');
      }
    }
    throw error;
  }
}

// 로그아웃 시 다음 로그인에서 계정을 다시 고르게 한다.
export async function signOutFromGoogle() {
  if (!configured) return;
  await GoogleSignin.signOut().catch(() => undefined);
}
