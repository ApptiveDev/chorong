DO $$
DECLARE
    attempted_quiz_ids TEXT;
BEGIN
    SELECT string_agg(DISTINCT quiz_id::text, ',' ORDER BY quiz_id::text)
    INTO attempted_quiz_ids
    FROM quiz_attempt
    JOIN quiz_item USING (quiz_id)
    WHERE interaction_type = 'FILL_BLANK';

    IF attempted_quiz_ids IS NOT NULL THEN
        RAISE EXCEPTION 'FILL_BLANK attempts require an explicit migration: quizIds=%', attempted_quiz_ids;
    END IF;
END $$;

UPDATE quiz_item
SET interaction_type = 'TAP',
    instruction = '빈칸에 알맞은 시대를 선택하세요.',
    config = jsonb_build_object(
        'selectionType', 'SINGLE',
        'items', jsonb_build_array(
            jsonb_build_object('id', 'renaissance', 'text', 'Renaissance'),
            jsonb_build_object('id', 'medieval', 'text', 'Medieval'),
            jsonb_build_object('id', 'modern', 'text', 'Modern')
        ),
        'displayMode', 'FILL_BLANK',
        'promptParts', jsonb_build_array('르네상스는 ', ' 시대입니다.')
    ),
    answer = jsonb_build_object('correctItemIds', jsonb_build_array('renaissance')),
    modified_at = now()
WHERE interaction_type = 'FILL_BLANK'
  AND question = '르네상스는 어떤 시대인가요?'
  AND config = '{}'::jsonb
  AND answer = '{"texts":["Renaissance"]}'::jsonb;

DO $$
DECLARE
    remaining_quiz_ids TEXT;
BEGIN
    SELECT string_agg(quiz_id::text, ',' ORDER BY quiz_id::text)
    INTO remaining_quiz_ids
    FROM quiz_item
    WHERE interaction_type = 'FILL_BLANK';

    IF remaining_quiz_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Unknown FILL_BLANK data requires authored TAP choices: quizIds=%', remaining_quiz_ids;
    END IF;
END $$;

ALTER TABLE quiz_item DROP CONSTRAINT ck_quiz_item_interaction_type;
ALTER TABLE quiz_item ADD CONSTRAINT ck_quiz_item_interaction_type CHECK (
    interaction_type IN ('SLIDER', 'SWIPE', 'TAP', 'DRAG_DROP', 'SORT', 'MATCHING', 'FLIP_CARD', 'MULTIPLE_CHOICE')
);
