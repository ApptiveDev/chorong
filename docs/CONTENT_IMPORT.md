# 컨텐츠 가져오기

별자리 JSON(형식: `local-only/컨텐츠 가이드/컨텐츠 작성 가이드.md`)을 코스·레슨·구간·화면·퀴즈로 저장한다. 그림·소리 파일은 올리지 않는다. S3 업로드는 따로 한다(`quiz/images/{별자리}/{레슨}/{파일}`, `quiz/audio/...`).

입력 경로는 별자리 폴더(`firefly/` → `firefly/firefly.json`)나 JSON 파일이다. 그림·소리는 JSON 옆의 레슨 폴더(`firefly/blue-pigment/lapis.svg`)에서 찾는다.

## 검사

DB 없이 검사만 한다. 상대 경로는 저장소 루트 기준이다.

```bash
./backend/gradlew -p backend :core:contentCheck --args="'<별자리 폴더>'"
./backend/gradlew -p backend :core:contentCheck --args="'<JSON 파일>' --no-media-check"   # 파일 존재 확인 생략
```

오류는 `레슨 blue-pigment · screens 3번 · answer: 이유` 형식으로 모두 출력한다. 이 목록을 담당자에게 돌려준다.

## 넣기

서버를 가져오기 모드로 띄운다. 끝나면 스스로 종료한다. 경로는 절대 경로로 준다.

```bash
POSTGRES_HOST=... POSTGRES_USER=... POSTGRES_PASSWORD=... DB_SCHEMA=chorong_dev \
CHORONG_MEDIA_BASE_URL=https://media-chorong-dev.bawibase.com/ \
./backend/gradlew -p backend :core:bootRun --args="--server.port=0 --app.content-import.path='<절대 경로>'"
```

- 미디어 주소 기본값은 dev(`https://media-chorong-dev.bawibase.com/`)다. prod는 `https://media-chorong.bawibase.com/`.
- 서버와 같이 Flyway가 돈다. 해당 버전의 백엔드를 배포한 뒤 실행한다.
- 그림·소리 파일 존재 확인을 생략하려면 `--app.content-import.media-check=false`를 더한다.
- 검사에서 오류가 나면 DB를 바꾸지 않고 종료 코드 1로 끝난다.
- 별자리 하나를 한 트랜잭션으로 넣는다.

## 다시 넣을 때

- 코스·레슨은 slug(`firefly`, `firefly/blue-pigment`)로 찾아 ID를 유지한다.
- 레슨 JSON(memo 제외)이나 미디어 주소가 바뀐 레슨만 `version`을 1 올리고 구간·화면을 새로 만든다. 그 레슨을 진행 중이던 사용자의 마지막 화면 위치는 지워진다.
- 퀴즈는 레슨 퀴즈·복습 전용 퀴즈 각각 같은 순번이고 유형이 같으면 ID를 유지한다. 풀이 기록과 복습 풀도 남는다. 남는 기존 퀴즈는 풀이 기록과 함께 지운다.
- JSON에서 빠진 레슨은 지우지 않고 순서만 뒤로 보낸다. 실행 결과에 목록이 나온다.

## V43 이후 퀴즈 다시 넣기

V43이 기존 형식 퀴즈를 모두 지웠다. 시뮬레이터 `data.js`를 별자리별 JSON으로 나눠(예: `local-only/컨텐츠 가이드/예시/firefly.json`) 위 순서대로 검사하고 넣는다. 시뮬레이터 그림은 레슨 폴더 구조가 달라 `--no-media-check`로 검사하고, 업로드는 `local-only/백엔드 해야할일.md` 작업 2-1을 따른다.
