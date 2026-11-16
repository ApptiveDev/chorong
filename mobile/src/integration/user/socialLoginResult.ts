import { IntegrationError } from '../client';

// 소셜 로그인 결과 모달.
// - noAccount: M01_3 기존 계정 없음
// - authFailed: M02_7 인증 실패
// - switchAccount: M02_8 기록 저장 중 기존 계정 발견
// - migrationFailed: M02_9 기록 승계 실패
export type SocialLoginModalKind = 'noAccount' | 'authFailed' | 'switchAccount' | 'migrationFailed';

// 소셜 로그인(API-105) 실패를 모달 종류로 바꾼다. 사용자 취소는 실패가 아니므로 여기 오지 않는다.
// guest: 요청 시점 세션이 비회원이었는지. switchingToExisting: switchToExisting 을 실어 보낸 재요청인지.
export function socialLoginErrorModal(
  error: unknown,
  { guest, switchingToExisting }: { guest: boolean; switchingToExisting: boolean },
): Exclude<SocialLoginModalKind, 'noAccount'> {
  if (!(error instanceof IntegrationError)) return 'authFailed';
  if (error.code === 'ACCOUNT_EXISTS_FOR_PROVIDER') {
    // 서버는 switchToExisting 을 아직 읽지 않아 재요청에도 ERR-14 를 돌려준다.
    // M02_8 을 다시 띄우면 같은 확인이 끝없이 반복되므로 M02_7 로 끝낸다.
    return guest && !switchingToExisting ? 'switchAccount' : 'authFailed';
  }
  // 서버에는 기록 승계 실패 전용 코드가 없다. 게스트→회원 전환은 로그인과 같은 트랜잭션에서 일어나
  // 실패하면 5xx 로 끝난다. 그래서 비회원의 5xx·연결 실패(status 없음)를 승계 실패로 추정한다.
  // status 가 없는 오류 중 요청 전에 클라이언트가 막은 것(설정·권한)은 연결 실패가 아니다.
  const network = error.status === null && !clientSideCodes.includes(error.code);
  if (guest && (network || (error.status ?? 0) >= 500)) return 'migrationFailed';
  return 'authFailed';
}

const clientSideCodes = ['CONFIGURATION_ERROR', 'MEMBER_ONLY', 'UNAUTHORIZED'];
