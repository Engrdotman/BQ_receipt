const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function seed() {
    const pool = new Pool({ connectionString: 'postgresql://postgres:hertheydotun@localhost:7085/master_db' });
    
    try {
        // Seed master user
        const masterPassword = await bcrypt.hash('master2026', 10);
        await pool.query(`
            INSERT INTO master_users (username, password, role) 
            VALUES ('master', $1, 'super_admin') 
            ON CONFLICT (username) DO NOTHING
        `, [masterPassword]);
        console.log('✅ Master user seeded (master/master2026)');

        // Get BQ Receipt database URL
        const bqDbUrl = 'postgresql://postgres:hertheydotun@localhost:7085/BQ_receiptdb';
        
        // Seed tenant
        await pool.query(`
            INSERT INTO tenants (tenant_id, name, slug, database_url, status) 
            VALUES ('tenant_bq', 'BQ Receipt', 'bq_receipt', $1, 'active') 
            ON CONFLICT (slug) DO NOTHING
        `, [bqDbUrl]);
        console.log('✅ Tenant seeded (bq_receipt)');

        // Seed client user
        const clientPassword = await bcrypt.hash('admin2026', 10);
        await pool.query(`
            INSERT INTO users (tenant_id, username, password, role) 
            VALUES ('tenant_bq', 'admin', $1, 'admin') 
            ON CONFLICT (tenant_id, username) DO NOTHING
        `, [clientPassword]);
        console.log('✅ Client user seeded (admin/admin2026)');

        // Verify
        const tenants = await pool.query("SELECT * FROM tenants");
        const users = await pool.query("SELECT id, tenant_id, username, role FROM users");
        const masterUsers = await pool.query("SELECT username, role FROM master_users");

        console.log('\n📊 Tenants:', tenants.rows);
        console.log('\n📊 Client Users:', users.rows);
        console.log('\n📊 Master Users:', masterUsers.rows);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

seed();