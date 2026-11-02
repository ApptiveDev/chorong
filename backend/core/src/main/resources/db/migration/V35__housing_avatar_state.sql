CREATE TABLE housing_avatar_state (
    user_id       BIGINT PRIMARY KEY,
    x             DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (x BETWEEN 0 AND 1),
    y             DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (y BETWEEN 0 AND 1),
    state         VARCHAR(10) NOT NULL DEFAULT 'IDLE' CHECK (state IN ('IDLE', 'SIT', 'SLEEP')),
    placement_id  BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_housing_avatar_state_user FOREIGN KEY (user_id) REFERENCES app_user (user_id)
);
