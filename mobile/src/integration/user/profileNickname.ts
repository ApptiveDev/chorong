// M04_1 닉네임 변경. 길이 규칙은 서버(UserNicknamePolicy, 앞뒤 공백을 뺀 1~10자)를 따른다.
// 중복이면 서버가 NICKNAME_TAKEN(HTTP 409)을 보낸다.
export const NICKNAME_RULE = '닉네임을 1~10자로 입력해 주세요.';
export const NICKNAME_TAKEN = '이미 사용 중인 닉네임이에요.';

export function nicknameValidationError(value: string): string | null {
  const nickname = value.trim();
  const length = Array.from(nickname).length;
  if (length < 1 || length > 10) return NICKNAME_RULE;
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/.test(nickname)) {
    return '한글, 영문, 숫자만 입력할 수 있습니다.';
  }
  return null;
}
