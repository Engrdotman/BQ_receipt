const { Pool } = require('pg');

async function checkTables() {
    const pool = new Pool({ connectionString: 'postgresql://postgres:hertheydotun@localhost:7085/master_db' });
    
    try {
        const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables in master_db:', result.rows.map(r => r.table_name));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkTables();