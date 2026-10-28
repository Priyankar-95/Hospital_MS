-- Every outgoing email is logged here

CREATE TABLE email_log (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    to_email       VARCHAR(190) NOT NULL,
    template       VARCHAR(80)  NOT NULL,
    subject        VARCHAR(255) NULL,
    status         ENUM('SENT','FAILED') NOT NULL,
    error_message  VARCHAR(500) NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_email_to (to_email, created_at),
    KEY idx_email_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
