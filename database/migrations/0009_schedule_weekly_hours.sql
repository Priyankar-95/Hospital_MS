-- Weekly working hours (the pattern a doctor sets) and booking mode on the dated schedule rows.
-- doctor_schedules rows (one per date and window) are generated from these hours for the next N days.

-- weekday follows ISO: 1 = Monday ... 7 = Sunday.
-- COUNT = per-day patient count (patients get a serial number); SLOTS = fixed-length slots, one patient per slot.
CREATE TABLE doctor_weekly_hours (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    doctor_id      BIGINT UNSIGNED NOT NULL,
    weekday        TINYINT UNSIGNED NOT NULL,
    start_time     TIME NOT NULL,
    end_time       TIME NOT NULL,
    booking_mode   ENUM('COUNT','SLOTS') NOT NULL DEFAULT 'COUNT',
    max_patients   SMALLINT UNSIGNED NOT NULL,
    slot_minutes   SMALLINT UNSIGNED NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_weekly_window (doctor_id, weekday, start_time),
    CONSTRAINT fk_weekly_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT chk_weekly_weekday  CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT chk_weekly_times    CHECK (end_time > start_time),
    CONSTRAINT chk_weekly_capacity CHECK (max_patients > 0),
    CONSTRAINT chk_weekly_slots    CHECK (booking_mode = 'COUNT' OR slot_minutes IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE doctor_schedules
    ADD COLUMN booking_mode ENUM('COUNT','SLOTS') NOT NULL DEFAULT 'COUNT' AFTER end_time,
    ADD COLUMN slot_minutes SMALLINT UNSIGNED NULL AFTER booking_mode,
    ADD COLUMN is_closed TINYINT(1) NOT NULL DEFAULT 0 AFTER booked_count,
    ADD COLUMN weekly_hours_id BIGINT UNSIGNED NULL AFTER is_closed,
    ADD CONSTRAINT fk_schedule_weekly FOREIGN KEY (weekly_hours_id) REFERENCES doctor_weekly_hours (id) ON DELETE SET NULL,
    ADD CONSTRAINT chk_schedule_slots CHECK (booking_mode = 'COUNT' OR slot_minutes IS NOT NULL);
