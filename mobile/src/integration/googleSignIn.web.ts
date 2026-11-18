// 웹은 GoogleButtonOverlay 의 Google 버튼이 idToken 을 직접 돌려준다. SDK 호출 경로는 없다.
export async function signInWithGoogle(): Promise<string | null> {
  throw new Error('Google 로그인 버튼을 눌러 다시 시도해 주세요.');
}

export async function signOutFromGoogle() {}
