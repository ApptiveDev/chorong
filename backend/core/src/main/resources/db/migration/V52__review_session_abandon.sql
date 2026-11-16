-- 복습 회차를 도중에 끝내거나(API-505) 새 회차를 시작하면(API-501) ABANDONED 로 닫는다.
ALTER TABLE review_session DROP CONSTRAINT ck_review_session_status;
ALTER TABLE review_session DROP CONSTRAINT ck_review_session_completion;
ALTER TABLE review_session
    ADD CONSTRAINT ck_review_session_status CHECK (status IN ('OPEN', 'COMPLETED', 'ABANDONED')),
    ADD CONSTRAINT ck_review_session_completion CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL));
