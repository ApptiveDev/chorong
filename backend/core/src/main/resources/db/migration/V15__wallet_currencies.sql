ALTER TABLE user_wallet
    ADD COLUMN star BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN stardust BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_user_wallet_star_nonnegative CHECK (star >= 0),
    ADD CONSTRAINT ck_user_wallet_stardust_nonnegative CHECK (stardust >= 0);
