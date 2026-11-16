-- 계정 고유번호. 42001000부터 계정 생성 순서대로 부여하고 바꾸지 않는다.
CREATE SEQUENCE app_user_code_seq START WITH 42001000 MINVALUE 42001000 MAXVALUE 42999999;

ALTER TABLE app_user ADD COLUMN user_code VARCHAR(8);

-- 기존 계정은 가입일 순서대로 채운다. 탈퇴 계정도 번호를 받는다.
WITH ordered AS (
    SELECT user_id, row_number() OVER (ORDER BY created_at, user_id) AS rn FROM app_user
)
UPDATE app_user u
SET user_code = (42001000 + o.rn - 1)::text
FROM ordered o
WHERE o.user_id = u.user_id;

SELECT setval('app_user_code_seq', 42001000 + (SELECT COUNT(*) FROM app_user), false);

ALTER SEQUENCE app_user_code_seq OWNED BY app_user.user_code;
ALTER TABLE app_user
    ALTER COLUMN user_code SET DEFAULT nextval('app_user_code_seq')::text,
    ALTER COLUMN user_code SET NOT NULL,
    ADD CONSTRAINT uq_app_user_code UNIQUE (user_code),
    ADD CONSTRAINT ck_app_user_code CHECK (user_code ~ '^42[0-9]{6}$');

-- 닉네임은 앞뒤 공백 없이 저장하고 중복을 막는다.
UPDATE app_user SET nickname = NULLIF(btrim(nickname), '') WHERE nickname IS DISTINCT FROM NULLIF(btrim(nickname), '');

-- 이미 겹친 닉네임은 먼저 가입한 계정만 남기고 나머지를 'No. ' + 고유번호로 바꾼다.
WITH ranked AS (
    SELECT user_id, row_number() OVER (PARTITION BY nickname ORDER BY created_at, user_id) AS rn
    FROM app_user
    WHERE nickname IS NOT NULL
)
UPDATE app_user u
SET nickname = 'No. ' || u.user_code
FROM ranked r
WHERE r.user_id = u.user_id AND r.rn > 1;

CREATE UNIQUE INDEX uq_app_user_nickname ON app_user (nickname);
