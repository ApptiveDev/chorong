CREATE TABLE housing_store_item (
    item_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    unlocked BOOLEAN NOT NULL DEFAULT TRUE,
    unlock_hint VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_housing_store_item_type CHECK (item_type IN ('FURNITURE', 'OBJECT'))
);
CREATE INDEX ix_housing_store_item_active ON housing_store_item (is_active, sort_order, item_id);

CREATE TABLE housing_store_option (
    option_id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES housing_store_item(item_id) ON DELETE CASCADE,
    option_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    currency VARCHAR(20) NOT NULL,
    price BIGINT NOT NULL,
    preview_asset VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_housing_store_option_currency CHECK (currency IN ('STAR', 'STARDUST')),
    CONSTRAINT ck_housing_store_option_price CHECK (price >= 0)
);
CREATE INDEX ix_housing_store_option_active ON housing_store_option (item_id, is_active, sort_order, option_id);

CREATE TABLE housing_store_owned_option (
    inventory_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    option_id BIGINT NOT NULL REFERENCES housing_store_option(option_id) ON DELETE CASCADE,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_housing_store_owned_option UNIQUE (user_id, option_id)
);
CREATE INDEX ix_housing_store_owned_option_user ON housing_store_owned_option (user_id, inventory_id);
