ALTER TABLE app_user DROP CONSTRAINT ck_app_user_status;
ALTER TABLE app_user
    ALTER COLUMN status SET DEFAULT 'GUEST',
    ADD CONSTRAINT ck_app_user_status CHECK (status IN ('GUEST', 'ACTIVE', 'WITHDRAWN')),
    ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN last_study_date DATE,
    ADD COLUMN streak_days INT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_app_user_streak_days CHECK (streak_days >= 0);

-- 회원 인증 수단이 없는 기존 게스트만 이관한다. 탈퇴·인증 수단 없는 계정은 변경하지 않는다.
UPDATE app_user u SET status = 'GUEST'
WHERE u.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM user_auth a WHERE a.user_id = u.user_id AND a.provider = 'GUEST')
  AND NOT EXISTS (SELECT 1 FROM user_auth a WHERE a.user_id = u.user_id AND a.provider <> 'GUEST');

-- 기존 nickname VARCHAR(40)와 값은 보존한다. 새 닉네임 검증은 서비스에서 수행한다.
