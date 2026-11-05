ALTER TABLE housing_coordinate_placement
    DROP CONSTRAINT ck_housing_coordinate_placement_layer,
    ADD CONSTRAINT ck_housing_coordinate_placement_layer CHECK (layer >= 0);

ALTER TABLE review_session_item
    ADD COLUMN answer_result JSONB;
