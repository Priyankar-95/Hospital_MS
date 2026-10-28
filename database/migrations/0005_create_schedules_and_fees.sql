-- Per-day schedules with capacity, and per-treatment fees

CREATE TABLE doctor_schedules (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    doctor_id     BIGINT UNSIGNED NOT NULL,
    work_date     DATE NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    max_patients  SMALLINT UNSIGNED NOT NULL,
    booked_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_schedule_window (doctor_id, work_date, start_time),
    KEY idx_schedule_date (work_date, doctor_id),
    CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT chk_schedule_times    CHECK (end_time > start_time),
    CONSTRAINT chk_schedule_capacity CHECK (max_patients > 0 AND booked_count <= max_patients)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE doctor_fees (
    id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    doctor_id                BIGINT UNSIGNED NOT NULL,
    treatment_name           VARCHAR(150) NOT NULL,
    fee                      DECIMAL(10,2) NOT NULL,
    is_active                TINYINT(1) NOT NULL DEFAULT 1,
    last_updated_by_user_id  BIGINT UNSIGNED NULL,
    last_updated_by_role     ENUM('DOCTOR','HOSPITAL_ADMIN') NOT NULL,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fee_treatment (doctor_id, treatment_name),
    CONSTRAINT fk_fee_doctor  FOREIGN KEY (doctor_id)               REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT fk_fee_updater FOREIGN KEY (last_updated_by_user_id) REFERENCES users (id)   ON DELETE SET NULL,
    CONSTRAINT chk_fee_amount CHECK (fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
