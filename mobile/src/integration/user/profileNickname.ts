// M04_1 닉네임 변경 · M04_2 첫 닉네임 설정. 길이 규칙은 서버(UserNicknamePolicy, 앞뒤 공백을 뺀 1~10자)를 따른다.
// 0.4.3 부터 닉네임 중복을 허용한다. NICKNAME_TAKEN 은 이전 서버 응답 호환용으로 M04_1 에만 남긴다.
export const NICKNAME_RULE = '닉네임을 1~10자로 입력해 주세요.';
export const NICKNAME_TAKEN = '이미 사용 중인 닉네임이에요.';
// 서버와 같이 글자 수를 코드포인트로 센다(이모지 하나 = 1자).
export const NICKNAME_MAX_LENGTH = 10;

// 명세(API-202) 규칙만 본다: 앞뒤 공백을 뺀 1~10자. M04_2 첫 닉네임 설정이 쓴다.
export function nicknameLengthError(value: string): string | null {
  const length = Array.from(value.trim()).length;
  return length < 1 || length > NICKNAME_MAX_LENGTH ? NICKNAME_RULE : null;
}

// M04_1 프로필 닉네임 변경. 길이 규칙에 더해 한글·영문·숫자만 받는다(기존 동작).
export function nicknameValidationError(value: string): string | null {
  const lengthError = nicknameLengthError(value);
  if (lengthError) return lengthError;
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/.test(value.trim())) {
    return '한글, 영문, 숫자만 입력할 수 있습니다.';
  }
  return null;
}
