// 웹에서만 의미가 있다. 네이티브는 googleSignIn.ts 의 SDK 로 로그인하므로 그리지 않는다.
export function GoogleButtonOverlay(_props: {
  width: number;
  disabled: boolean;
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
}) {
  return null;
}
