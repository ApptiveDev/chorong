ALTER TABLE housing_owned_item ADD COLUMN acquired_via VARCHAR(20) NOT NULL DEFAULT 'PURCHASE';
ALTER TABLE housing_store_owned_option ADD COLUMN acquired_via VARCHAR(20) NOT NULL DEFAULT 'PURCHASE';

UPDATE housing_owned_item o SET acquired_via = 'STARTER'
WHERE EXISTS (
    SELECT 1 FROM housing_furniture i WHERE o.item_type = 'FURNITURE' AND i.furniture_id = o.item_id AND i.is_default
    UNION ALL SELECT 1 FROM housing_background i WHERE o.item_type = 'BACKGROUND' AND i.background_id = o.item_id AND i.is_default
    UNION ALL SELECT 1 FROM housing_wall i WHERE o.item_type = 'WALL' AND i.wall_id = o.item_id AND i.is_default
    UNION ALL SELECT 1 FROM housing_floor i WHERE o.item_type = 'FLOOR' AND i.floor_id = o.item_id AND i.is_default
    UNION ALL SELECT 1 FROM housing_avatar i WHERE o.item_type = 'AVATAR' AND i.avatar_id = o.item_id AND i.is_default
    UNION ALL SELECT 1 FROM housing_room i WHERE o.item_type = 'ROOM' AND i.room_id = o.item_id AND i.is_default
);

ALTER TABLE housing_owned_item ADD CONSTRAINT ck_housing_owned_item_acquired_via
    CHECK (acquired_via IN ('PURCHASE', 'REWARD', 'STARTER'));
ALTER TABLE housing_store_owned_option ADD CONSTRAINT ck_store_owned_option_acquired_via
    CHECK (acquired_via IN ('PURCHASE', 'REWARD', 'STARTER'));
