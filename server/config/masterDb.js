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
        const result = await masterPool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'tenants'
            ) as tenants
        `);

        if (!result.rows[0].tenants) {
            console.log("⚠️ Master tables not found. Run database/master.sql first.");
        } else {
            console.log("✅ Master database connected");

            await masterPool.query(`
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    revoked BOOLEAN DEFAULT FALSE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS password_resets (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE,
                    token TEXT NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
                CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
                CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at);
                CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);
            `);

            console.log("✅ Refresh tokens table ensured");
        }
    } catch (error) {
        console.error("❌ Master DB init error:", error.message);
    }
};

export default masterPool;