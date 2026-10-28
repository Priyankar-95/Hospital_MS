-- Phase 2 step 1: hospitals join by invitation from a Branch Admin (owner decision, 2026-10-24).
-- The hospital row is created only when the invited person accepts and fills in the form.

-- Single-use, expiring invite from a Branch Admin. Only the SHA-256 hash of the token is stored.
CREATE TABLE hospital_invites (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_admin_id  BIGINT UNSIGNED NOT NULL,
    district_id      BIGINT UNSIGNED NOT NULL,
    hospital_name    VARCHAR(200) NOT NULL,
    email            VARCHAR(190) NOT NULL,
    phone            VARCHAR(20)  NULL,
    token_hash       CHAR(64) NOT NULL,
    status           ENUM('INVITED','ACCEPTED','REVOKED') NOT NULL DEFAULT 'INVITED',
    expires_at       DATETIME NOT NULL,
    used_at          DATETIME NULL,
    hospital_id      BIGINT UNSIGNED NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hinv_token (token_hash),
    KEY idx_hinv_admin_status (branch_admin_id, status),
    KEY idx_hinv_district (district_id),
    KEY idx_hinv_email (email),
    CONSTRAINT fk_hinv_admin    FOREIGN KEY (branch_admin_id) REFERENCES users (id)     ON DELETE RESTRICT,
    CONSTRAINT fk_hinv_district FOREIGN KEY (district_id)     REFERENCES districts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_hinv_hospital FOREIGN KEY (hospital_id)     REFERENCES hospitals (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- License / registration files of a hospital (a path relative to /uploads, never served directly).
-- Replaces the single hospitals.license_doc_url for new applications, like doctor_documents does for doctors.
CREATE TABLE hospital_documents (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id    BIGINT UNSIGNED NOT NULL,
    doc_type       ENUM('LICENSE','REGISTRATION','CERTIFICATE','OTHER') NOT NULL,
    file_url       VARCHAR(500) NOT NULL,
    original_name  VARCHAR(255) NULL,
    mime_type      VARCHAR(100) NULL,
    size_bytes     INT UNSIGNED NULL,
    uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_hdocs_hospital (hospital_id),
    CONSTRAINT fk_hdocs_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
