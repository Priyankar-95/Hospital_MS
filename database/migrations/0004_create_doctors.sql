-- Doctors, hospital invites, and credential documents

-- user_id is NULL only for a hospital-invited doctor who has not accepted the invite yet.
CREATE TABLE doctors (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id              BIGINT UNSIGNED NULL,
    district_id          BIGINT UNSIGNED NOT NULL,
    hospital_id          BIGINT UNSIGNED NULL,
    doctor_type          ENUM('HOSPITAL','PRIVATE') NOT NULL,
    specialty_id         BIGINT UNSIGNED NOT NULL,
    about                TEXT NULL,
    qualifications       VARCHAR(500) NULL,
    photo_url            VARCHAR(500) NULL,
    clinic_name          VARCHAR(200) NULL,
    address              VARCHAR(500) NULL,
    facilities           TEXT NULL,
    latitude             DECIMAL(10,7) NULL,
    longitude            DECIMAL(10,7) NULL,
    advance_booking_days SMALLINT UNSIGNED NOT NULL DEFAULT 14,
    verification_status  ENUM('INVITED','INCOMPLETE','PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'INCOMPLETE',
    rejection_reason     VARCHAR(500) NULL,
    verified_by          BIGINT UNSIGNED NULL,
    verified_at          DATETIME NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_doctors_user (user_id),
    KEY idx_doctors_search (verification_status, district_id, specialty_id),
    KEY idx_doctors_hospital (hospital_id, verification_status),
    CONSTRAINT fk_doctors_user      FOREIGN KEY (user_id)      REFERENCES users (id)       ON DELETE CASCADE,
    CONSTRAINT fk_doctors_district  FOREIGN KEY (district_id)  REFERENCES districts (id)   ON DELETE RESTRICT,
    CONSTRAINT fk_doctors_hospital  FOREIGN KEY (hospital_id)  REFERENCES hospitals (id)   ON DELETE RESTRICT,
    CONSTRAINT fk_doctors_specialty FOREIGN KEY (specialty_id) REFERENCES specialties (id) ON DELETE RESTRICT,
    CONSTRAINT fk_doctors_verifier  FOREIGN KEY (verified_by)  REFERENCES users (id)       ON DELETE SET NULL,
    CONSTRAINT chk_doctors_type_hospital CHECK (
        (doctor_type = 'HOSPITAL' AND hospital_id IS NOT NULL) OR
        (doctor_type = 'PRIVATE'  AND hospital_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-use, expiring invite. Only the SHA-256 hash of the token is stored.
CREATE TABLE doctor_invites (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id   BIGINT UNSIGNED NOT NULL,
    doctor_id     BIGINT UNSIGNED NOT NULL,
    invitee_name  VARCHAR(150) NOT NULL,
    email         VARCHAR(190) NOT NULL,
    token_hash    CHAR(64) NOT NULL,
    status        ENUM('INVITED','ACCOUNT_CREATED','PENDING_VERIFICATION','APPROVED','REJECTED','EXPIRED','REVOKED') NOT NULL DEFAULT 'INVITED',
    expires_at    DATETIME NOT NULL,
    used_at       DATETIME NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_invites_token (token_hash),
    KEY idx_invites_hospital_status (hospital_id, status),
    KEY idx_invites_email (email),
    KEY idx_invites_doctor (doctor_id),
    CONSTRAINT fk_invites_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals (id) ON DELETE CASCADE,
    CONSTRAINT fk_invites_doctor   FOREIGN KEY (doctor_id)   REFERENCES doctors (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- file_url from the PRD is stored as a path relative to /uploads (files are not publicly served)
CREATE TABLE doctor_documents (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    doctor_id      BIGINT UNSIGNED NOT NULL,
    doc_type       ENUM('DEGREE','REGISTRATION','CERTIFICATE','ID_PROOF','OTHER') NOT NULL,
    file_url       VARCHAR(500) NOT NULL,
    original_name  VARCHAR(255) NULL,
    mime_type      VARCHAR(100) NULL,
    size_bytes     INT UNSIGNED NULL,
    uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_docs_doctor (doctor_id),
    CONSTRAINT fk_docs_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
