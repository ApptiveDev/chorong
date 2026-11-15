-- 컨텐츠 가져오기 도구가 레슨 JSON의 SHA-256을 저장한다. 값이 바뀌면 화면을 다시 만들고 content_version 을 올린다.
ALTER TABLE lesson ADD COLUMN content_hash CHAR(64);
