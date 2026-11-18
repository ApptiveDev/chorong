type GoogleModule = typeof import('@react-native-google-signin/google-signin');

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;
let googleModule: GoogleModule | undefined;

// 네이티브 모듈이라 Expo Go 에서는 import 시점에 던진다. 로그인을 누를 때까지 불러오지 않는다.
function google(): GoogleModule {
  if (googleModule) return googleModule;
  try {
    googleModule = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    throw new Error('Google 로그인은 Expo Go 에서 지원하지 않습니다. 개발 빌드를 사용하세요.');
  }
  return googleModule;
}

// 백엔드는 idToken 의 aud 를 Web 클라이언트 ID 로 검증한다. 그래서 webClientId 를 꼭 넘긴다.
function configure() {
  if (configured) return;
  if (!webClientId) throw new Error('Google 로그인이 이 빌드에 설정되지 않았습니다.');
  google().GoogleSignin.configure({ webClientId, iosClientId });
  configured = true;
}

// 사용자가 취소하면 null 을 돌려준다.
export async function signInWithGoogle(): Promise<string | null> {
  configure();
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = google();
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
  await google()
    .GoogleSignin.signOut()
    .catch(() => undefined);
}
