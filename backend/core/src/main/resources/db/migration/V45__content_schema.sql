-- OpenAPI 0.4.1 콘텐츠 구조: 고정 키(slug), 레슨 키워드·버전·출처·엔딩, 개념 화면 키워드, 복습 전용 퀴즈.

-- 영상 화면은 0.4.0에서 제외했다. 남은 VIDEO 화면이 있으면 지우기 전에 확인하도록 마이그레이션을 멈춘다.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM lesson_content WHERE content_type = 'VIDEO') THEN
        RAISE EXCEPTION 'lesson_content has VIDEO rows. Decide how to migrate them before applying V45.';
    END IF;
END $$;

-- 별자리(코스). 분야·주제는 더 이상 받지 않지만 기존 행 호환을 위해 열은 남긴다.
ALTER TABLE course ADD COLUMN slug VARCHAR(100);
UPDATE course SET slug = 'course-' || course_id;
ALTER TABLE course
    ALTER COLUMN slug SET NOT NULL,
    ALTER COLUMN category DROP NOT NULL,
    ALTER COLUMN topic DROP NOT NULL,
    ADD CONSTRAINT uq_course_slug UNIQUE (slug),
    ADD CONSTRAINT ck_course_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
DROP INDEX ix_course_category_topic;

-- 레슨(별). slug 는 별자리 slug 와 레슨 고정 키를 / 로 잇는다(예 firefly/blue-pigment).
ALTER TABLE lesson
    ADD COLUMN slug VARCHAR(201),
    ADD COLUMN keyword TEXT NOT NULL DEFAULT '',
    ADD COLUMN content_version INT NOT NULL DEFAULT 1,
    ADD COLUMN source TEXT,
    ADD COLUMN ending_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN ending_image_url TEXT;
UPDATE lesson l SET slug = c.slug || '/lesson-' || l.lesson_id FROM course c WHERE c.course_id = l.course_id;
ALTER TABLE lesson
    ALTER COLUMN slug SET NOT NULL,
    ADD CONSTRAINT uq_lesson_slug UNIQUE (slug),
    ADD CONSTRAINT ck_lesson_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT ck_lesson_content_version CHECK (content_version >= 1),
    ADD CONSTRAINT ck_lesson_ending_image_url CHECK (ending_image_url IS NULL OR btrim(ending_image_url) <> '');

-- 화면. 개념(IMAGE) 화면에 키워드와 대사를 둔다. VIDEO 유형은 없앤다.
ALTER TABLE lesson_content ADD COLUMN keyword TEXT;
ALTER TABLE lesson_content DROP CONSTRAINT ck_lesson_content_payload;
ALTER TABLE lesson_content DROP CONSTRAINT lesson_content_content_type_check;
ALTER TABLE lesson_content
    ADD CONSTRAINT ck_lesson_content_type CHECK (content_type IN ('TEXT', 'IMAGE', 'QUIZ')),
    ADD CONSTRAINT ck_lesson_content_payload CHECK (
        (content_type = 'TEXT' AND (body IS NOT NULL OR dialogue <> '[]'::jsonb) AND media_url IS NULL AND quiz_id IS NULL AND keyword IS NULL)
        OR (content_type = 'IMAGE' AND media_url IS NOT NULL AND quiz_id IS NULL)
        OR (content_type = 'QUIZ' AND body IS NULL AND media_url IS NULL AND quiz_id IS NOT NULL AND keyword IS NULL)
    );

-- 복습 전용 퀴즈. 레슨 진행에는 나오지 않으므로 lesson_content 에 연결할 수 없다.
ALTER TABLE quiz_item ADD COLUMN review_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE FUNCTION fn_lesson_content_not_review_only() RETURNS trigger AS $$
BEGIN
    IF NEW.quiz_id IS NOT NULL AND EXISTS (SELECT 1 FROM quiz_item WHERE quiz_id = NEW.quiz_id AND review_only) THEN
        RAISE EXCEPTION 'review-only quiz % cannot be lesson content', NEW.quiz_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lesson_content_not_review_only
    BEFORE INSERT OR UPDATE OF quiz_id ON lesson_content
    FOR EACH ROW EXECUTE FUNCTION fn_lesson_content_not_review_only();

CREATE FUNCTION fn_quiz_item_review_only_unlinked() RETURNS trigger AS $$
BEGIN
    IF NEW.review_only AND EXISTS (SELECT 1 FROM lesson_content WHERE quiz_id = NEW.quiz_id) THEN
        RAISE EXCEPTION 'quiz % is lesson content and cannot be review-only', NEW.quiz_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quiz_item_review_only_unlinked
    BEFORE UPDATE OF review_only ON quiz_item
    FOR EACH ROW EXECUTE FUNCTION fn_quiz_item_review_only_unlinked();
