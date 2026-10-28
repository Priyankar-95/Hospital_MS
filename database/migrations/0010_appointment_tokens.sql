-- token_number: the serial number (COUNT windows) or the slot position (SLOTS windows, 1 = first slot).
-- active_token is token_number for bookings that still hold a place (anything except CANCELLED), otherwise NULL.
-- The unique key then makes it impossible for two active bookings to share a serial number or a slot,
-- even if application code were ever wrong. (NULLs are allowed many times, so cancelled bookings never conflict.)

ALTER TABLE appointments
    ADD COLUMN token_number SMALLINT UNSIGNED NULL AFTER slot_time,
    ADD COLUMN active_token SMALLINT UNSIGNED AS (IF(status = 'CANCELLED', NULL, token_number)) PERSISTENT AFTER token_number,
    ADD UNIQUE KEY uq_appt_active_token (schedule_id, active_token);
