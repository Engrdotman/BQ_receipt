const { Pool } = require('pg');

async function updateTenant() {
    const pool = new Pool({ connectionString: 'postgresql://postgres:hertheydotun@localhost:7085/master_db' });
    
    try {
        const bqDbUrl = 'postgresql://postgres:hertheydotun@localhost:7085/BQ_receiptdb';
        
        await pool.query(`
            UPDATE tenants SET database_url = $1 WHERE tenant_id = 'tenant_bq'
        `, [bqDbUrl]);
        
        const result = await pool.query("SELECT * FROM tenants WHERE tenant_id = 'tenant_bq'");
        console.log('✅ Tenant updated:', result.rows[0]);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

updateTenant();