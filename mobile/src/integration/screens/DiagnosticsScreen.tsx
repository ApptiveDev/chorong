import { useState } from 'react';
import { Text } from 'react-native';
import { client, useMockApi } from '../runtime';
import { catalog } from '../catalog';
import { useIntegration } from '../hooks';
import { Button, Card, Json, Nav, Page, styles } from '../ui';

export default function DiagnosticsScreen() {
  const state = useIntegration(),
    [selected, setSelected] = useState<number | null>(null);
  const trace = state.traces.find((t) => t.sequence === selected) ?? state.traces[0];
  return (
    <Page title="개발 API 테스트 메뉴">
      <Card title="실행 환경">
        <Text selectable style={styles.text}>
          API Base URL: {client.baseURL}
        </Text>
        <Text>인증: {state.authenticated ? '로그인됨' : '로그인 안 됨'}</Text>
        <Text>
          userId: {state.user?.userId ?? '없음'} · {state.user?.status ?? '없음'}
        </Text>
        <Text>{useMockApi ? 'Mock 모드' : 'Real API 모드 · 서버 검증 대기'}</Text>
      </Card>
      <Nav href="/integration" label="기능 테스트 메뉴 열기" />
      <Card title="마지막 요청 상세">
        <Json value={trace ?? { status: '요청 기록 없음' }} />
        <Text style={styles.text}>
          status=HTTP Status, durationMs=응답 시간(ms), code=서버 오류 코드. 인증 본문은 숨깁니다.
          requestId는 장애 신고에 사용합니다.
        </Text>
      </Card>
      <Card title="최근 요청 (메모리, 최대 30개)">
        {state.traces.map((t) => (
          <Button
            key={t.sequence}
            title={`${t.api} ${t.method} ${t.endpoint} · ${t.status ?? '연결 실패'} · ${t.success ? '성공' : '실패'} · 선택`}
            onPress={() => setSelected(t.sequence)}
          />
        ))}
        <Button title="요청 기록 삭제" onPress={client.clearTraces} />
      </Card>
      <Card title="명세 API 전체 목록">
        {Object.entries(catalog).map(([id, item]) => (
          <Text key={id} style={styles.text}>
            {id} · {item[2]}
            {'\n'}
            {item[0]} {item[1]}
            {'\n'}
            {item[3] === 'deferred'
              ? 'UI만 배치 / 명세 변경 대기'
              : ['API-105', 'API-301'].includes(id)
                ? '수동 API 시험 / 플랫폼 연동 대기'
                : ['API-406', 'API-502'].includes(id)
                  ? '입력·호출 구현 / 답안 의미 명세 확인 필요'
                  : '구현 완료 / 서버 검증 대기'}
          </Text>
        ))}
      </Card>
    </Page>
  );
}
