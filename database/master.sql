-- Master Database Schema
-- Receipt Multi-Tenant System
-- This database stores: tenants, master_users, and tenant users (shared across all tenants)

-- 1. Tenants table (list of all organizations)
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    database_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Master admin users (super admins who can manage tenants)
CREATE TABLE IF NOT EXISTS master_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'super_admin',
    tenant_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 3. Tenant users (users belonging to a specific tenant/organization)
-- These are the regular user accounts that login to the app
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    username VARCHAR(50) NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    UNIQUE(tenant_id, username)
);

-- 4. Password resets (for forgot password feature)
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Refresh tokens (for persistent login sessions)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_type VARCHAR(20) DEFAULT 'client', -- 'client' or 'master'
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_master_users_username ON master_users(username);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);

-- Pre-insert notes:
-- Passwords should be bcrypt hashes.
-- Default master password: "master2026" → $2b$10$uNFcvJCvsbLhIObiUbwR9OvOFOWlZNRnkZHgBNYgcvAvwOYJOIhS6
-- Default client password: "admin2026"  → $2b$10$DNaC8VZtgnLtlbjQWjVxw.51gFQZXhZIHaoCy45i7NdVOEtpVIvNe

-- To insert default data, run:
-- INSERT INTO master_users (username, password, role) VALUES ('master', '$2b$10$uNFcvJCvsbLhIObiUbwR9OvOFOWlZNRnkZHgBNYgcvAvwOYJOIhS6', 'super_admin');
-- INSERT INTO tenants (tenant_id, name, slug, database_url, status) VALUES ('tenant_bq', 'BQ Receipt', 'bq_receipt', 'postgresql://postgres:password@localhost:5432/bq_receiptdb', 'active');
-- INSERT INTO users (tenant_id, username, password, role) VALUES ('tenant_bq', 'admin', '$2b$10$DNaC8VZtgnLtlbjQWjVxw.51gFQZXhZIHaoCy45i7NdVOEtpVIvNe', 'admin');