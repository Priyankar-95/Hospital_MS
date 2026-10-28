-- Users (all roles share this table) and geography (states, districts, branch admin scoping)

CREATE TABLE users (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    role           ENUM('PATIENT','DOCTOR','HOSPITAL_ADMIN','HOSPITAL_FRONTDESK','BRANCH_ADMIN','VENDOR_ADMIN','SUPER_ADMIN') NOT NULL,
    auth_provider  ENUM('GOOGLE','EMAIL') NOT NULL,
    google_id      VARCHAR(64)  NULL,
    email          VARCHAR(190) NOT NULL,
    password_hash  VARCHAR(255) NULL,
    name           VARCHAR(150) NOT NULL,
    phone          VARCHAR(20)  NULL,
    status         ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    last_login_at  DATETIME NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_google_id (google_id),
    KEY idx_users_role_status (role, status),
    CONSTRAINT chk_users_has_credential CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE states (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    state_name  VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_states_name (state_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE districts (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    state_id       BIGINT UNSIGNED NOT NULL,
    district_name  VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_districts_state_name (state_id, district_name),
    CONSTRAINT fk_districts_state FOREIGN KEY (state_id) REFERENCES states (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which districts a Branch Admin may verify accounts in
CREATE TABLE branch_admin_districts (
    branch_admin_id  BIGINT UNSIGNED NOT NULL,
    district_id      BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (branch_admin_id, district_id),
    KEY idx_bad_district (district_id),
    CONSTRAINT fk_bad_user     FOREIGN KEY (branch_admin_id) REFERENCES users (id)     ON DELETE CASCADE,
    CONSTRAINT fk_bad_district FOREIGN KEY (district_id)     REFERENCES districts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
