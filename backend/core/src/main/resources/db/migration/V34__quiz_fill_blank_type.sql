ALTER TABLE quiz_item DROP CONSTRAINT ck_quiz_item_interaction_type;
ALTER TABLE quiz_item ADD CONSTRAINT ck_quiz_item_interaction_type CHECK (
    interaction_type IN ('SLIDER', 'SWIPE', 'TAP', 'DRAG_DROP', 'SORT', 'MATCHING', 'FLIP_CARD', 'MULTIPLE_CHOICE', 'FILL_BLANK')
);
