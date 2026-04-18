-- Client Database Schema (per tenant)
-- Each tenant gets their own database with this schema

-- Users table for tenant
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Receipts table
CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    receipt_id VARCHAR(50) UNIQUE NOT NULL,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    payment_method TEXT,
    imei_number TEXT,
    items JSONB,
    total_amount DECIMAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_id ON receipts(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_name ON receipts(customer_name);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);