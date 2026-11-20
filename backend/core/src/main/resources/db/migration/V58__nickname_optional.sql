-- 닉네임 중복을 허용한다.
DROP INDEX uq_app_user_nickname;

-- 기본 닉네임('No. ' + 숫자 8자리)을 그대로 쓰던 계정은 닉네임을 비워서 다음 로그인 때 닉네임 설정 모달을 띄운다.
-- V53이 중복을 풀면서 'No. ' + 고유번호로 바꾼 계정도 여기에 해당한다.
UPDATE app_user SET nickname = NULL WHERE nickname ~ '^No\. [0-9]{8}$';
