const { Pool } = require('pg');

async function check() {
    const pool = new Pool({ connectionString: 'postgresql://postgres:hertheydotun@localhost:7085/master_db' });
    
    try {
        console.log('Checking database constraints for table password_resets...');
        const result = await pool.query(`
            SELECT 
                conname as constraint_name, 
                contype as constraint_type 
            FROM pg_constraint 
            WHERE conrelid = 'password_resets'::regclass;
        `);
        
        console.log('Constraints:', result.rows);
        
        const hasUnique = result.rows.some(r => r.constraint_type === 'u');
        const hasPrimaryKey = result.rows.some(r => r.constraint_type === 'p');
        
        if (hasUnique || hasPrimaryKey) {
            console.log('✅ Found unique or primary key constraint on password_resets');
        } else {
            console.log('❌ NO unique constraint found on password_resets');
        }
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

check();
