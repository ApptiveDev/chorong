export function nicknameValidationError(value: string): string | null {
  const nickname = value.trim();
  const length = Array.from(nickname).length;
  if (length < 2 || length > 12) return '닉네임은 2~12자로 입력하세요.';
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/.test(nickname)) {
    return '한글, 영문, 숫자만 입력할 수 있습니다.';
  }
  return null;
}
