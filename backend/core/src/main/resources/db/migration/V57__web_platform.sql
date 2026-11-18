ALTER TABLE auth_guest DROP CONSTRAINT ck_auth_guest_platform;
ALTER TABLE auth_guest ADD CONSTRAINT ck_auth_guest_platform CHECK (platform IN ('IOS', 'ANDROID', 'WEB'));

ALTER TABLE push_device DROP CONSTRAINT ck_push_device_platform;
ALTER TABLE push_device ADD CONSTRAINT ck_push_device_platform CHECK (platform IN ('IOS', 'ANDROID', 'WEB'));
