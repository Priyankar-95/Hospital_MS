-- Pharmacy: stores, products, orders

CREATE TABLE medical_stores (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    district_id          BIGINT UNSIGNED NOT NULL,
    vendor_user_id       BIGINT UNSIGNED NOT NULL,
    name                 VARCHAR(200) NOT NULL,
    address              VARCHAR(500) NOT NULL,
    phone                VARCHAR(20) NULL,
    latitude             DECIMAL(10,7) NULL,
    longitude            DECIMAL(10,7) NULL,
    offers_delivery      TINYINT(1) NOT NULL DEFAULT 1,
    offers_pickup        TINYINT(1) NOT NULL DEFAULT 1,
    license_doc_url      VARCHAR(500) NULL,
    verification_status  ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    rejection_reason     VARCHAR(500) NULL,
    verified_by          BIGINT UNSIGNED NULL,
    verified_at          DATETIME NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_stores_vendor (vendor_user_id),
    KEY idx_stores_district_status (district_id, verification_status),
    CONSTRAINT fk_stores_district FOREIGN KEY (district_id)    REFERENCES districts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_stores_vendor   FOREIGN KEY (vendor_user_id) REFERENCES users (id)     ON DELETE RESTRICT,
    CONSTRAINT fk_stores_verifier FOREIGN KEY (verified_by)    REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pharmacy_products (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    store_id              BIGINT UNSIGNED NOT NULL,
    product_name          VARCHAR(200) NOT NULL,
    category              ENUM('PRESCRIPTION','OTC','DISPOSABLE','DIAGNOSTIC_DEVICE') NOT NULL,
    description           VARCHAR(500) NULL,
    price                 DECIMAL(10,2) NOT NULL,
    stock_qty             INT UNSIGNED NOT NULL DEFAULT 0,
    requires_prescription TINYINT(1) NOT NULL DEFAULT 0,
    is_active             TINYINT(1) NOT NULL DEFAULT 1,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_products_store (store_id, is_active),
    KEY idx_products_category (category),
    KEY idx_products_name (product_name),
    CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES medical_stores (id) ON DELETE CASCADE,
    CONSTRAINT chk_products_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pharmacy_orders (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_code          VARCHAR(16) NOT NULL,
    patient_id          BIGINT UNSIGNED NOT NULL,
    store_id            BIGINT UNSIGNED NOT NULL,
    prescription_url    VARCHAR(500) NULL,
    fulfilment          ENUM('DELIVERY','PICKUP') NOT NULL,
    delivery_address    VARCHAR(500) NULL,
    status              ENUM('PLACED','CONFIRMED','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELLED','REJECTED') NOT NULL DEFAULT 'PLACED',
    total               DECIMAL(10,2) NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_code (order_code),
    KEY idx_orders_patient (patient_id, created_at),
    KEY idx_orders_store_status (store_id, status),
    CONSTRAINT fk_orders_patient FOREIGN KEY (patient_id) REFERENCES users (id)          ON DELETE RESTRICT,
    CONSTRAINT fk_orders_store   FOREIGN KEY (store_id)   REFERENCES medical_stores (id) ON DELETE RESTRICT,
    CONSTRAINT chk_orders_total CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pharmacy_order_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id      BIGINT UNSIGNED NOT NULL,
    product_id    BIGINT UNSIGNED NOT NULL,
    product_name  VARCHAR(200) NOT NULL,
    unit_price    DECIMAL(10,2) NOT NULL,
    quantity      INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_items_order (order_id),
    KEY idx_items_product (product_id),
    CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES pharmacy_orders (id)   ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES pharmacy_products (id) ON DELETE RESTRICT,
    CONSTRAINT chk_items_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
