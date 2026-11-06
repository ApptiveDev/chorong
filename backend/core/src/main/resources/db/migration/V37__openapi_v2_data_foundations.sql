ALTER TABLE course ADD COLUMN topic VARCHAR(100);
UPDATE course SET topic = left(title, 100);
ALTER TABLE course ALTER COLUMN topic SET NOT NULL;
ALTER TABLE course ADD CONSTRAINT ck_course_topic_nonblank CHECK (btrim(topic) <> '');
CREATE INDEX ix_course_category_topic ON course (category, topic, course_order, course_id);

CREATE TABLE lesson_segment (
    lesson_id BIGINT NOT NULL REFERENCES lesson(lesson_id) ON DELETE CASCADE,
    segment_id VARCHAR(100) NOT NULL,
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    segment_order INT NOT NULL CHECK (segment_order >= 1),
    PRIMARY KEY (lesson_id, segment_id),
    CONSTRAINT uq_lesson_segment_order UNIQUE (lesson_id, segment_order)
);

INSERT INTO lesson_segment (lesson_id, segment_id, title, segment_order)
SELECT l.lesson_id, 'legacy-' || l.lesson_id, l.title, 1
FROM lesson l
WHERE EXISTS (SELECT 1 FROM lesson_content c WHERE c.lesson_id = l.lesson_id);

ALTER TABLE lesson_content
    ADD COLUMN segment_id VARCHAR(100),
    ADD COLUMN dialogue JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN source TEXT;

UPDATE lesson_content SET segment_id = 'legacy-' || lesson_id;

ALTER TABLE lesson_content
    ADD CONSTRAINT fk_lesson_content_segment
        FOREIGN KEY (lesson_id, segment_id) REFERENCES lesson_segment (lesson_id, segment_id),
    ADD CONSTRAINT ck_lesson_content_dialogue_array CHECK (jsonb_typeof(dialogue) = 'array');

ALTER TABLE lesson_content DROP CONSTRAINT ck_lesson_content_payload;
ALTER TABLE lesson_content
    ADD CONSTRAINT ck_lesson_content_payload CHECK (
        (content_type = 'TEXT' AND (body IS NOT NULL OR dialogue <> '[]'::jsonb) AND media_url IS NULL AND quiz_id IS NULL)
        OR (content_type IN ('IMAGE', 'VIDEO') AND body IS NULL AND media_url IS NOT NULL AND quiz_id IS NULL)
        OR (content_type = 'QUIZ' AND body IS NULL AND media_url IS NULL AND quiz_id IS NOT NULL)
    );
CREATE INDEX ix_lesson_content_segment ON lesson_content (lesson_id, segment_id, content_order);

ALTER TABLE lesson ADD COLUMN artwork_image_url TEXT;
ALTER TABLE lesson
    ADD CONSTRAINT ck_lesson_artwork_image_url CHECK (artwork_image_url IS NULL OR btrim(artwork_image_url) <> '');

CREATE TABLE learning_artwork (
    artwork_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lesson(lesson_id),
    image_url TEXT NOT NULL CHECK (btrim(image_url) <> ''),
    completed_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_learning_artwork_user_lesson UNIQUE (user_id, lesson_id)
);
CREATE INDEX ix_learning_artwork_history ON learning_artwork (user_id, completed_at DESC, artwork_id DESC);

ALTER TABLE housing_owned_item DROP CONSTRAINT uq_housing_owned_item;
CREATE UNIQUE INDEX uq_housing_owned_item_non_furniture
    ON housing_owned_item (user_id, item_type, item_id) WHERE item_type <> 'FURNITURE';

ALTER TABLE housing_store_owned_option DROP CONSTRAINT uq_housing_store_owned_option;
CREATE INDEX ix_housing_store_owned_option_user_option
    ON housing_store_owned_option (user_id, option_id, inventory_id);

ALTER TABLE housing_coordinate_placement ADD COLUMN flipped_x BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE housing_coordinate_placement
    ADD CONSTRAINT uq_housing_coordinate_placement_store_inventory UNIQUE (store_inventory_id);

ALTER TABLE housing_profile ALTER COLUMN is_public SET DEFAULT TRUE;
