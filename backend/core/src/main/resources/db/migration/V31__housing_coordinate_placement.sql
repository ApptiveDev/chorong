CREATE TABLE housing_coordinate_placement (
    placement_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    owned_item_id BIGINT,
    store_inventory_id BIGINT,
    area VARCHAR(10) NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    rotation INT NOT NULL DEFAULT 0,
    layer INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_coordinate_placement_user FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_housing_coordinate_placement_inventory FOREIGN KEY (owned_item_id) REFERENCES housing_owned_item (owned_item_id) ON DELETE CASCADE,
    CONSTRAINT uq_housing_coordinate_placement_item UNIQUE (owned_item_id),
    CONSTRAINT ck_housing_coordinate_placement_area CHECK (area IN ('INTERIOR', 'EXTERIOR')),
    CONSTRAINT ck_housing_coordinate_placement_x CHECK (x BETWEEN 0 AND 1),
    CONSTRAINT ck_housing_coordinate_placement_y CHECK (y BETWEEN 0 AND 1),
    CONSTRAINT ck_housing_coordinate_placement_rotation CHECK (rotation IN (0, 90, 180, 270)),
    CONSTRAINT ck_housing_coordinate_placement_layer CHECK (layer BETWEEN 0 AND 9),
    CONSTRAINT ck_housing_coordinate_placement_inventory CHECK ((owned_item_id IS NOT NULL) <> (store_inventory_id IS NOT NULL))
);
CREATE INDEX ix_housing_coordinate_placement_user ON housing_coordinate_placement (user_id, layer, placement_id);
