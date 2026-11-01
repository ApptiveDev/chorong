ALTER TABLE lesson_progress
    ADD COLUMN last_content_id BIGINT REFERENCES lesson_content(content_id) ON DELETE SET NULL;

CREATE INDEX ix_lesson_progress_last_content ON lesson_progress(user_id, last_content_id);
