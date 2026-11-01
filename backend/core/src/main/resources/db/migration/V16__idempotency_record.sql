CREATE TABLE idempotency_record (
    idempotency_record_id BIGSERIAL PRIMARY KEY,
    user_id               BIGINT NOT NULL,
    operation_id          VARCHAR(100) NOT NULL,
    idempotency_key       VARCHAR(64) NOT NULL,
    request_hash          CHAR(64) NOT NULL,
    response_status       INTEGER,
    response_body         TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    expires_at            TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_idempotency_record_user FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
    CONSTRAINT uq_idempotency_record_scope UNIQUE (user_id, operation_id, idempotency_key),
    CONSTRAINT ck_idempotency_response_complete CHECK ((response_status IS NULL) = (response_body IS NULL))
);

CREATE INDEX ix_idempotency_record_expires_at ON idempotency_record (expires_at);
