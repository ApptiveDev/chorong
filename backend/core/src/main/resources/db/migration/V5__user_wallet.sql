CREATE TABLE user_wallet (
    user_id      BIGINT PRIMARY KEY,
    coin         BIGINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_wallet_user FOREIGN KEY (user_id) REFERENCES app_user (user_id)
);

INSERT INTO user_wallet (user_id, coin, created_at, modified_at)
SELECT user_id, coin, created_at, modified_at FROM housing_profile;

ALTER TABLE housing_profile DROP COLUMN coin;
