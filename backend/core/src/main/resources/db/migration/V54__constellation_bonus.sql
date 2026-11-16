-- 별자리 완성 보너스(0.4.1 API-407). 별자리(코스)마다 에너지·상점 해금·세계관 스토리를 여러 개 둘 수 있다.

-- 상점: 바닥·벽지 아이템과 색상 옵션 해금.
-- housing_store_item.unlocked 가 FALSE 인 아이템, requires_unlock 이 TRUE 인 옵션은 사용자별 해금(user_store_unlock)이 있어야 산다.
ALTER TABLE housing_store_item DROP CONSTRAINT ck_housing_store_item_type;
ALTER TABLE housing_store_item ADD CONSTRAINT ck_housing_store_item_type
    CHECK (item_type IN ('FURNITURE', 'OBJECT', 'FLOOR', 'WALL'));
ALTER TABLE housing_store_option
    ADD COLUMN requires_unlock BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN unlock_hint VARCHAR(200);

CREATE TABLE user_store_unlock (
    user_store_unlock_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL REFERENCES housing_store_item(item_id) ON DELETE CASCADE,
    -- NULL 이면 아이템 해금, 값이 있으면 그 색상 옵션 해금
    option_id BIGINT REFERENCES housing_store_option(option_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_user_store_unlock ON user_store_unlock (user_id, item_id, COALESCE(option_id, 0));

-- 세계관 스토리는 ID만 둔다. 본문과 조회 API는 아직 없다.
CREATE TABLE world_story (
    story_id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE constellation_bonus (
    bonus_id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
    bonus_type VARCHAR(20) NOT NULL,
    energy INT,
    item_id BIGINT REFERENCES housing_store_item(item_id),
    option_id BIGINT REFERENCES housing_store_option(option_id),
    story_id BIGINT REFERENCES world_story(story_id),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_constellation_bonus_shape CHECK (
        (bonus_type = 'ENERGY' AND energy > 0 AND item_id IS NULL AND option_id IS NULL AND story_id IS NULL)
        OR (bonus_type = 'UNLOCK' AND energy IS NULL AND item_id IS NOT NULL AND story_id IS NULL)
        OR (bonus_type = 'STORY' AND energy IS NULL AND item_id IS NULL AND option_id IS NULL AND story_id IS NOT NULL)
    )
);
CREATE INDEX ix_constellation_bonus_course ON constellation_bonus (course_id, sort_order, bonus_id);

-- 보상 기록: 에너지, 넘친 에너지를 바꾼 별가루, 상점 해금, 스토리.
ALTER TABLE reward_ledger
    ADD COLUMN option_id BIGINT,
    ADD COLUMN story_id BIGINT,
    ADD COLUMN converted_energy INT;
ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_type;
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_type
    CHECK (reward_type IN ('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION', 'STORY'));
ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_wallet;
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_wallet CHECK (
    (reward_type = 'WALLET' AND currency IN ('STAR', 'STARDUST', 'ENERGY') AND amount > 0
        AND item_id IS NULL AND option_id IS NULL AND story_id IS NULL AND constellation_id IS NULL
        AND (converted_energy IS NULL OR (currency = 'STARDUST' AND converted_energy > 0)))
    OR (reward_type = 'CONSTELLATION' AND currency IS NULL AND amount IS NULL AND item_id IS NULL
        AND option_id IS NULL AND story_id IS NULL AND converted_energy IS NULL AND constellation_id IS NOT NULL)
    OR (reward_type = 'UNLOCK' AND currency IS NULL AND amount IS NULL AND item_id IS NOT NULL
        AND story_id IS NULL AND converted_energy IS NULL AND constellation_id IS NULL)
    OR (reward_type = 'STORY' AND currency IS NULL AND amount IS NULL AND item_id IS NULL
        AND option_id IS NULL AND story_id IS NOT NULL AND converted_energy IS NULL AND constellation_id IS NULL)
);
