-- Hospitals, their departments, and front-desk staff

CREATE TABLE hospitals (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    district_id          BIGINT UNSIGNED NOT NULL,
    admin_user_id        BIGINT UNSIGNED NOT NULL,
    name                 VARCHAR(200) NOT NULL,
    address              VARCHAR(500) NOT NULL,
    phone                VARCHAR(20)  NULL,
    email                VARCHAR(190) NULL,
    facilities           TEXT NULL,
    total_beds           INT UNSIGNED NOT NULL DEFAULT 0,
    available_beds       INT UNSIGNED NOT NULL DEFAULT 0,
    latitude             DECIMAL(10,7) NULL,
    longitude            DECIMAL(10,7) NULL,
    license_doc_url      VARCHAR(500) NULL,
    verification_status  ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    rejection_reason     VARCHAR(500) NULL,
    verified_by          BIGINT UNSIGNED NULL,
    verified_at          DATETIME NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hospitals_admin (admin_user_id),
    KEY idx_hospitals_district_status (district_id, verification_status),
    CONSTRAINT fk_hospitals_district FOREIGN KEY (district_id)   REFERENCES districts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_hospitals_admin    FOREIGN KEY (admin_user_id) REFERENCES users (id)     ON DELETE RESTRICT,
    CONSTRAINT fk_hospitals_verifier FOREIGN KEY (verified_by)   REFERENCES users (id)     ON DELETE SET NULL,
    CONSTRAINT chk_hospitals_beds CHECK (available_beds <= total_beds)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Departments a hospital runs (Hospital Admin manages these)
CREATE TABLE hospital_departments (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id   BIGINT UNSIGNED NOT NULL,
    specialty_id  BIGINT UNSIGNED NOT NULL,
    bed_count     INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hd_hospital_specialty (hospital_id, specialty_id),
    KEY idx_hd_specialty (specialty_id),
    CONSTRAINT fk_hd_hospital  FOREIGN KEY (hospital_id)  REFERENCES hospitals (id)   ON DELETE CASCADE,
    CONSTRAINT fk_hd_specialty FOREIGN KEY (specialty_id) REFERENCES specialties (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hospital_staff (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    staff_role  ENUM('FRONTDESK') NOT NULL DEFAULT 'FRONTDESK',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hs_user (user_id),
    KEY idx_hs_hospital (hospital_id),
    CONSTRAINT fk_hs_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals (id) ON DELETE CASCADE,
    CONSTRAINT fk_hs_user     FOREIGN KEY (user_id)     REFERENCES users (id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
