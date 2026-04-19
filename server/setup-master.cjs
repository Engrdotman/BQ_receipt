const { Pool } = require('pg');

async function createTables() {
    const pool = new Pool({ connectionString: 'postgresql://postgres:hertheydotun@localhost:7085/master_db' });
    
    try {
        // Create users table for client credentials
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(50) NOT NULL,
                username VARCHAR(50) NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                UNIQUE(tenant_id, username)
            )
        `);
        console.log('✅ users table created');

        // Create password_resets table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE,
                token TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ password_resets table created');

        // Check all tables
        const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables in master_db:', result.rows.map(r => r.table_name));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

createTables();