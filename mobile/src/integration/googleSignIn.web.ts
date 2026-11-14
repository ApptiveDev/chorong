// 웹 빌드는 네이티브 Google 로그인 모듈을 쓰지 않는다.
export async function signInWithGoogle(): Promise<string | null> {
  throw new Error('웹에서는 Google 로그인을 지원하지 않습니다. 앱에서 로그인해 주세요.');
}

export async function signOutFromGoogle() {}
