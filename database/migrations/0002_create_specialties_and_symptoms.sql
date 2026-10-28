-- Specialties (departments) and the plain symptom -> specialty list (not an AI feature)

CREATE TABLE specialties (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(100) NOT NULL,
    slug         VARCHAR(120) NOT NULL,
    description  VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_specialties_name (name),
    UNIQUE KEY uq_specialties_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE symptoms (
    id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name  VARCHAR(120) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_symptoms_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A symptom can point to more than one specialty
CREATE TABLE symptom_specialties (
    symptom_id    BIGINT UNSIGNED NOT NULL,
    specialty_id  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (symptom_id, specialty_id),
    KEY idx_ss_specialty (specialty_id),
    CONSTRAINT fk_ss_symptom   FOREIGN KEY (symptom_id)   REFERENCES symptoms (id)    ON DELETE CASCADE,
    CONSTRAINT fk_ss_specialty FOREIGN KEY (specialty_id) REFERENCES specialties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
