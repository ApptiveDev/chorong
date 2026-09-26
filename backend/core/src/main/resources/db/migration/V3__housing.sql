CREATE TABLE app_user (
    user_id      BIGSERIAL PRIMARY KEY,
    device_uuid  VARCHAR(36) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_user_device_uuid UNIQUE (device_uuid)
);

CREATE TABLE housing_background (
    background_id  BIGSERIAL PRIMARY KEY,
    code           VARCHAR(60) NOT NULL,
    name           VARCHAR(80) NOT NULL,
    sort_order     INT NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_background_code UNIQUE (code)
);

CREATE TABLE housing_wall (
    wall_id      BIGSERIAL PRIMARY KEY,
    code         VARCHAR(60) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_wall_code UNIQUE (code)
);

CREATE TABLE housing_floor (
    floor_id     BIGSERIAL PRIMARY KEY,
    code         VARCHAR(60) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_floor_code UNIQUE (code)
);

CREATE TABLE housing_avatar (
    avatar_id    BIGSERIAL PRIMARY KEY,
    code         VARCHAR(60) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_avatar_code UNIQUE (code)
);

CREATE TABLE housing_room (
    room_id      BIGSERIAL PRIMARY KEY,
    code         VARCHAR(60) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_room_code UNIQUE (code)
);

CREATE TABLE housing_furniture (
    furniture_id  BIGSERIAL PRIMARY KEY,
    code          VARCHAR(60) NOT NULL,
    name          VARCHAR(80) NOT NULL,
    category      VARCHAR(30) NOT NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_furniture_code UNIQUE (code)
);

CREATE TABLE housing_furniture_room (
    furniture_room_id  BIGSERIAL PRIMARY KEY,
    furniture_id       BIGINT NOT NULL,
    room_id            BIGINT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_furniture_room_furniture FOREIGN KEY (furniture_id) REFERENCES housing_furniture (furniture_id),
    CONSTRAINT fk_housing_furniture_room_room FOREIGN KEY (room_id) REFERENCES housing_room (room_id),
    CONSTRAINT uq_housing_furniture_room UNIQUE (furniture_id, room_id)
);

CREATE TABLE housing_room_surface (
    surface_id   BIGSERIAL PRIMARY KEY,
    room_id      BIGINT NOT NULL,
    code         VARCHAR(60) NOT NULL,
    kind         VARCHAR(10) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_room_surface_room FOREIGN KEY (room_id) REFERENCES housing_room (room_id),
    CONSTRAINT uq_housing_room_surface_code UNIQUE (room_id, code),
    CONSTRAINT ck_housing_room_surface_kind CHECK (kind IN ('WALL', 'FLOOR'))
);
CREATE INDEX ix_housing_room_surface_room ON housing_room_surface (room_id);

CREATE TABLE housing_room_slot (
    slot_id      BIGSERIAL PRIMARY KEY,
    room_id      BIGINT NOT NULL,
    code         VARCHAR(60) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_room_slot_room FOREIGN KEY (room_id) REFERENCES housing_room (room_id),
    CONSTRAINT uq_housing_room_slot_code UNIQUE (room_id, code)
);
CREATE INDEX ix_housing_room_slot_room ON housing_room_slot (room_id);

CREATE TABLE housing_room_slot_category (
    slot_category_id  BIGSERIAL PRIMARY KEY,
    slot_id           BIGINT NOT NULL,
    category          VARCHAR(30) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_room_slot_category_slot FOREIGN KEY (slot_id) REFERENCES housing_room_slot (slot_id),
    CONSTRAINT uq_housing_room_slot_category UNIQUE (slot_id, category)
);

CREATE TABLE housing_profile (
    user_id         BIGINT PRIMARY KEY,
    coin            BIGINT NOT NULL DEFAULT 0,
    active_room_id  BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_profile_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_housing_profile_active_room FOREIGN KEY (active_room_id) REFERENCES housing_room (room_id)
);

CREATE TABLE housing_owned_item (
    owned_item_id  BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL,
    item_type      VARCHAR(20) NOT NULL,
    item_id        BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_owned_item_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT uq_housing_owned_item UNIQUE (user_id, item_type, item_id),
    CONSTRAINT ck_housing_owned_item_type CHECK (item_type IN ('BACKGROUND', 'WALL', 'FLOOR', 'AVATAR', 'FURNITURE', 'ROOM'))
);
CREATE INDEX ix_housing_owned_item_user ON housing_owned_item (user_id);

CREATE TABLE housing_shop_item (
    shop_item_id  BIGSERIAL PRIMARY KEY,
    code          VARCHAR(60) NOT NULL,
    item_type     VARCHAR(20) NOT NULL,
    item_id       BIGINT NOT NULL,
    price_coin    BIGINT NOT NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_shop_item_code UNIQUE (code),
    CONSTRAINT uq_housing_shop_item_target UNIQUE (item_type, item_id),
    CONSTRAINT ck_housing_shop_item_type CHECK (item_type IN ('BACKGROUND', 'WALL', 'FLOOR', 'AVATAR', 'FURNITURE', 'ROOM'))
);

CREATE TABLE housing_room_layout (
    layout_id      BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL,
    room_id        BIGINT NOT NULL,
    background_id  BIGINT NOT NULL,
    avatar_id      BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_room_layout_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_housing_room_layout_room FOREIGN KEY (room_id) REFERENCES housing_room (room_id),
    CONSTRAINT fk_housing_room_layout_background FOREIGN KEY (background_id) REFERENCES housing_background (background_id),
    CONSTRAINT fk_housing_room_layout_avatar FOREIGN KEY (avatar_id) REFERENCES housing_avatar (avatar_id),
    CONSTRAINT uq_housing_room_layout_user_room UNIQUE (user_id, room_id)
);
CREATE INDEX ix_housing_room_layout_user ON housing_room_layout (user_id);

CREATE TABLE housing_layout_surface_skin (
    surface_skin_id  BIGSERIAL PRIMARY KEY,
    layout_id        BIGINT NOT NULL,
    surface_id       BIGINT NOT NULL,
    skin_type        VARCHAR(10) NOT NULL,
    skin_id          BIGINT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_layout_surface_skin_layout FOREIGN KEY (layout_id) REFERENCES housing_room_layout (layout_id) ON DELETE CASCADE,
    CONSTRAINT fk_housing_layout_surface_skin_surface FOREIGN KEY (surface_id) REFERENCES housing_room_surface (surface_id),
    CONSTRAINT uq_housing_layout_surface_skin UNIQUE (layout_id, surface_id),
    CONSTRAINT ck_housing_layout_surface_skin_type CHECK (skin_type IN ('WALL', 'FLOOR'))
);

CREATE TABLE housing_layout_placement (
    placement_id  BIGSERIAL PRIMARY KEY,
    layout_id     BIGINT NOT NULL,
    slot_id       BIGINT NOT NULL,
    furniture_id  BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_layout_placement_layout FOREIGN KEY (layout_id) REFERENCES housing_room_layout (layout_id) ON DELETE CASCADE,
    CONSTRAINT fk_housing_layout_placement_slot FOREIGN KEY (slot_id) REFERENCES housing_room_slot (slot_id),
    CONSTRAINT fk_housing_layout_placement_furniture FOREIGN KEY (furniture_id) REFERENCES housing_furniture (furniture_id),
    CONSTRAINT uq_housing_layout_placement UNIQUE (layout_id, slot_id)
);
