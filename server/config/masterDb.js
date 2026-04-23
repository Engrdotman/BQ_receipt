import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

if (!process.env.MASTER_DATABASE_URL) {
    throw new Error("❌ MASTER_DATABASE_URL is not set");
}

const masterPool = new Pool({
    connectionString: process.env.MASTER_DATABASE_URL
});

export const getMasterPool = () => masterPool;

export const initializeMasterDatabase = async () => {
    try {
        console.log("=== INITIALIZING MASTER DATABASE ===");
        
        // Check if tenants table exists
        const result = await masterPool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'tenants'
            ) as tenants
        `);

        if (!result.rows[0].tenants) {
            console.log("⚠️ Master tables not found. Running database/master.sql automatically...");
            try {
                // Try to run the SQL setup file
                const fs = await import('fs');
                const path = await import('path');
                const sqlPath = path.join(process.cwd(), 'database', 'master.sql');
                const sql = fs.readFileSync(sqlPath, 'utf8');
                // Split by semicolon and execute each statement
                const statements = sql.split(';').filter(s => s.trim());
                for (const stmt of statements) {
                    if (stmt.trim() && !stmt.trim().startsWith('--')) {
                        try {
                            await masterPool.query(stmt);
                        } catch (e) {
                            // Ignore if object already exists
                            if (!e.message.includes('already exists')) {
                                console.warn('SQL stmt warning:', e.message);
                            }
                        }
                    }
                }
                console.log("✅ master.sql executed");
            } catch (e) {
                console.error("❌ Failed to run master.sql:", e.message);
                console.log("Please run: psql $MASTER_DATABASE_URL -f database/master.sql");
            }
        } else {
            console.log("✅ Master database tables exist");
            
            // Ensure users table has all required columns (for existing deployments)
            try {
                // Check if users table has password column
                const colCheck = await masterPool.query(`
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'password'
                `);
                if (colCheck.rows.length === 0) {
                    console.log("⚠️ users.password column missing, adding it...");
                    await masterPool.query(`ALTER TABLE users ADD COLUMN password TEXT`);
                    console.log("✅ Added password column to users");
                }
                
                // Check if users table has tenant_id column
                const tenantCheck = await masterPool.query(`
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'tenant_id'
                `);
                if (tenantCheck.rows.length === 0) {
                    console.log("⚠️ users.tenant_id column missing, adding it...");
                    await masterPool.query(`ALTER TABLE users ADD COLUMN tenant_id VARCHAR(50)`);
                    // Create index
                    await masterPool.query(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`);
                    console.log("✅ Added tenant_id column to users");
                }
            } catch (e) {
                console.warn("⚠️ Could not verify users schema:", e.message);
            }
        }

        // Drop corrupted tables one by one to ensure clean schema
        console.log("🗑️ Dropping corrupted auth tables for schema rebuild...");
        await masterPool.query(`DROP TABLE IF EXISTS refresh_tokens CASCADE`);
        await masterPool.query(`DROP TABLE IF EXISTS password_resets CASCADE`);
        await masterPool.query(`DROP TABLE IF EXISTS users CASCADE`);
        await masterPool.query(`DROP TABLE IF EXISTS master_users CASCADE`);
        await masterPool.query(`DROP TABLE IF EXISTS tenants CASCADE`);
        console.log("✅ Corrupted tables dropped");

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
            );
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);
            CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
        `);

        console.log("✅ Master database initialized");
        
        // Print summary
        const summary = await masterPool.query(`
            SELECT 
                (SELECT COUNT(*) FROM tenants) as tenant_count,
                (SELECT COUNT(*) FROM users) as user_count,
                (SELECT COUNT(*) FROM master_users) as master_count
        `);
        console.log(`📊 DB stats: tenants=${summary.rows[0].tenant_count}, users=${summary.rows[0].user_count}, master_users=${summary.rows[0].master_count}`);
        
    } catch (error) {
        console.error("❌ Master DB init error:", error.message);
    }
};

export default masterPool;