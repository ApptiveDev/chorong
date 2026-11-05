CREATE TABLE housing_like (
    housing_user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    liker_user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_housing_like PRIMARY KEY (housing_user_id, liker_user_id),
    CONSTRAINT ck_housing_like_not_self CHECK (housing_user_id <> liker_user_id)
);

CREATE INDEX ix_housing_like_liker ON housing_like(liker_user_id, housing_user_id);
