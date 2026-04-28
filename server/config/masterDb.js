import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

if (!process.env.MASTER_DATABASE_URL) {
    throw new Error("❌ MASTER_DATABASE_URL is not set");
}

console.log("Connecting to Master DB:", process.env.MASTER_DATABASE_URL ? process.env.MASTER_DATABASE_URL.replace(/:[^:@]+@/, ':***@') : "UNDEFINED");
const masterPool = new Pool({
    connectionString: process.env.MASTER_DATABASE_URL,
    ssl: false
});

export const getMasterPool = () => masterPool;

export const initializeMasterDatabase = async () => {
    try {
        console.log("=== INITIALIZING MASTER DATABASE ===");
        
        // Always ensure all tables exist (CREATE TABLE IF NOT EXISTS is idempotent)
        console.log("Ensuring all master tables exist...");
        
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL,
                database_url TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS master_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'super_admin',
                tenant_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);
        
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                username VARCHAR(50) NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                UNIQUE(tenant_id, username)
            )
        `);
        
        console.log("✅ Master tables verified/created");
        
        // Ensure indexes exist
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_master_users_username ON master_users(username)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        
        console.log("✅ Indexes verified/created");
        
        // Migrate existing tables if needed (add missing columns)
        try {
            // Check and add tenant_id to tenants table
            const tenantIdCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tenants' AND column_name = 'tenant_id'
            `);
            if (tenantIdCheck.rows.length === 0) {
                console.log("⚠️ Adding tenant_id column to tenants table...");
                await masterPool.query(`ALTER TABLE tenants ADD COLUMN tenant_id VARCHAR(50)`);
                // Make it UNIQUE after adding
                await masterPool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_tenant_id ON tenants(tenant_id)`);
                console.log("✅ Added tenant_id column to tenants");
            }
            
            // Check and add other missing columns to tenants
            const nameCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tenants' AND column_name = 'name'
            `);
            if (nameCheck.rows.length === 0) {
                await masterPool.query(`ALTER TABLE tenants ADD COLUMN name VARCHAR(100)`);
                await masterPool.query(`UPDATE tenants SET name = COALESCE(slug, 'Unknown') WHERE name IS NULL`);
            }
            
            const slugCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tenants' AND column_name = 'slug'
            `);
            if (slugCheck.rows.length === 0) {
                await masterPool.query(`ALTER TABLE tenants ADD COLUMN slug VARCHAR(50)`);
                await masterPool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug_unique ON tenants(slug)`);
            }
            
            const dbUrlCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tenants' AND column_name = 'database_url'
            `);
            if (dbUrlCheck.rows.length === 0) {
                await masterPool.query(`ALTER TABLE tenants ADD COLUMN database_url TEXT`);
            }
            
            const statusCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tenants' AND column_name = 'status'
            `);
            if (statusCheck.rows.length === 0) {
                await masterPool.query(`ALTER TABLE tenants ADD COLUMN status VARCHAR(20) DEFAULT 'active'`);
            }
            
            console.log("✅ Tenants table migration complete");
        } catch (migrateErr) {
            console.warn("⚠️ Migration warning:", migrateErr.message);
        }

        // Ensure refresh_tokens and password_resets tables
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_type VARCHAR(20) DEFAULT 'client',
                token TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                revoked BOOLEAN DEFAULT FALSE
            )
        `);
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migrate existing tables to ensure they have user_id
        try {
            const refreshUserIdCheck = await masterPool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'refresh_tokens' AND column_name = 'user_id'
            `);
            if (refreshUserIdCheck.rows.length === 0) {
                console.log("⚠️ Adding user_id column to refresh_tokens table...");
                await masterPool.query(`ALTER TABLE refresh_tokens ADD COLUMN user_id INTEGER`);
            }
        } catch (e) {
            console.warn("⚠️ refresh_tokens user_id migration warning:", e.message);
        }

        try {
            const resetUserIdCheck = await masterPool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'password_resets' AND column_name = 'user_id'
            `);
            if (resetUserIdCheck.rows.length === 0) {
                console.log("⚠️ Adding user_id column to password_resets table...");
                await masterPool.query(`ALTER TABLE password_resets ADD COLUMN user_id INTEGER`);
            }
        } catch (e) {
            console.warn("⚠️ password_resets user_id migration warning:", e.message);
        }

        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked)`);
        await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)`);
        
        // Migrate refresh_tokens table if revoked column is missing
        try {
            const revokedCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'refresh_tokens' AND column_name = 'revoked'
            `);
            if (revokedCheck.rows.length === 0) {
                console.log("⚠️ Adding revoked column to refresh_tokens table...");
                await masterPool.query(`ALTER TABLE refresh_tokens ADD COLUMN revoked BOOLEAN DEFAULT FALSE`);
                console.log("✅ Added revoked column to refresh_tokens");
            }
        } catch (migrateErr) {
            console.warn("⚠️ refresh_tokens revoked column migration warning:", migrateErr.message);
        }
        
        // Drop problematic foreign key constraint if it exists
        try {
            await masterPool.query(`
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name = 'refresh_tokens_user_id_fkey'
                        AND table_name = 'refresh_tokens'
                    ) THEN
                        ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_user_id_fkey;
                        RAISE NOTICE 'Dropped foreign key constraint refresh_tokens_user_id_fkey';
                    END IF;
                END
                $$;
            `);
        } catch (fkErr) {
            console.log("ℹ️ Foreign key check/update:", fkErr.message);
        }
        
        // Migrate refresh_tokens table if user_type column is missing
        try {
            const userTypeCheck = await masterPool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'refresh_tokens' AND column_name = 'user_type'
            `);
            if (userTypeCheck.rows.length === 0) {
                console.log("⚠️ Adding user_type column to refresh_tokens table...");
                await masterPool.query(`ALTER TABLE refresh_tokens ADD COLUMN user_type VARCHAR(20) DEFAULT 'client'`);
                console.log("✅ Added user_type column to refresh_tokens");
            }
        } catch (migrateErr) {
            console.warn("⚠️ refresh_tokens migration warning:", migrateErr.message);
        }
        
        // Fix users table tenant_id NOT NULL constraint violation
        try {
            // Check if there are users with NULL tenant_id
            const nullTenantCheck = await masterPool.query(
                'SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL'
            );
            
            if (parseInt(nullTenantCheck.rows[0].count) > 0) {
                console.log(`⚠️ Found ${nullTenantCheck.rows[0].count} users with NULL tenant_id, fixing...`);
                
                // First, make sure we have a tenant to assign them to
                const tenantResult = await masterPool.query(
                    'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
                    ['bq_receipt']
                );
                
                if (tenantResult.rows.length > 0) {
                    const tenantId = tenantResult.rows[0].id;
                    console.log(`ℹ️ Assigning NULL tenant_id users to tenant_id=${tenantId}`);
                    
                    // Update NULL tenant_id values to point to bq_receipt tenant
                    await masterPool.query(
                        'UPDATE users SET tenant_id = $1 WHERE tenant_id IS NULL',
                        [tenantId]
                    );
                    console.log("✅ Fixed NULL tenant_id values in users table");
                } else {
                    console.warn("⚠️ No bq_receipt tenant found to assign NULL tenant_id users");
                }
            }
        } catch (nullErr) {
            console.warn("⚠️ NULL tenant_id migration warning:", nullErr.message);
        }

        // Insert default data if missing
        console.log("Checking default data...");
        
        // Default master user
        await masterPool.query(`
            INSERT INTO master_users (username, password, role)
            VALUES ('master', '$2b$10$uNFcvJCvsbLhIObiUbwR9OvOFOWlZNRnkZHgBNYgcvAvwOYJOIhS6', 'super_admin')
            ON CONFLICT (username) DO NOTHING
        `);
        
        // Default tenant (bq_receipt) - insert without tenant_id to avoid type issues
        const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost/bq_receiptdb';
        if (!databaseUrl) {
            console.warn("⚠️ DATABASE_URL is not set, using fallback for tenant insertion");
        }
        await masterPool.query(`
            INSERT INTO tenants (tenant_id, name, slug, database_url, status)
            VALUES ('tenant_bq', 'BQ Receipt', 'bq_receipt', $1, 'active')
            ON CONFLICT (slug) DO NOTHING
        `, [databaseUrl]);
        
        // Get the tenant id for the user insertion (use VARCHAR tenant_id)
        const tenantResult = await masterPool.query(`SELECT id, tenant_id FROM tenants WHERE slug = 'bq_receipt'`);
        const tenantRow = tenantResult.rows[0];
        
        console.log(`ℹ️ Found tenant: id=${tenantRow?.id}, tenant_id=${tenantRow?.tenant_id}`);
        
        if (tenantRow?.tenant_id) {
            const tenantIdForUser = tenantRow.tenant_id; // Use VARCHAR tenant_id
            
            try {
                // Check if user exists
                const existingUser = await masterPool.query(
                    `SELECT id, tenant_id FROM users WHERE username = 'admin'`
                );
                
                if (existingUser.rows.length > 0) {
                    console.log(`ℹ️ Updating user 'admin' with tenant_id=${tenantIdForUser}`);
                    // Update existing user's tenant_id and password
                    await masterPool.query(`
                        UPDATE users 
                        SET tenant_id = $1, password = '$2b$10$DNaC8VZtgnLtlbjQWjVxw.51gFQZXhZIHaoCy45i7NdVOEtpVIvNe'
                        WHERE username = 'admin'
                    `, [tenantIdForUser]);
                    console.log(`✅ Updated user 'admin' with tenant_id=${tenantIdForUser}`);
                } else {
                    // Insert new user
                    console.log(`ℹ️ Inserting user 'admin' with tenant_id=${tenantIdForUser}`);
                    await masterPool.query(`
                        INSERT INTO users (tenant_id, username, password, role)
                        VALUES ($1, 'admin', '$2b$10$DNaC8VZtgnLtlbjQWjVxw.51gFQZXhZIHaoCy45i7NdVOEtpVIvNe', 'admin')
                    `, [tenantIdForUser]);
                    console.log(`✅ Inserted user 'admin' with tenant_id=${tenantIdForUser}`);
                }
            } catch (userErr) {
                console.error(`❌ Failed to insert/update user 'admin': ${userErr.message}`, userErr);
            }
        } else {
            console.log("ℹ️ Could not find tenant for bq_receipt");
        }
        
        console.log("✅ Master database initialized");
        
        // Print summary
        const tenantCount = await masterPool.query('SELECT COUNT(*) as count FROM tenants');
        const userCount = await masterPool.query('SELECT COUNT(*) as count FROM users');
        const masterCount = await masterPool.query('SELECT COUNT(*) as count FROM master_users');
        console.log(`📊 DB stats: tenants=${tenantCount.rows[0].count}, users=${userCount.rows[0].count}, master_users=${masterCount.rows[0].count}`);
        
    } catch (error) {
        console.error("❌ Master DB init error:", error.message);
    }
};

export default masterPool;