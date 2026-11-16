-- 도중 나가기(API-409): 보고 있던 화면, 아직 제출하지 않은 입력, 저장 시점의 레슨 버전.
-- 컨텐츠를 다시 가져와 화면이 지워지면 위치는 NULL이 되고 이어하기는 마지막 완료 화면 다음부터 시작한다.
ALTER TABLE lesson_progress
    ADD COLUMN current_content_id BIGINT REFERENCES lesson_content(content_id) ON DELETE SET NULL,
    ADD COLUMN draft JSONB,
    ADD COLUMN content_version INT,
    ADD CONSTRAINT ck_lesson_progress_draft CHECK (draft IS NULL OR jsonb_typeof(draft) = 'object');
