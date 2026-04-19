const { Pool } = require('pg');

async function fix() {
    const pool = new Pool({ connectionString: 'postgresql://postgres:hertheydotun@localhost:7085/master_db' });
    
    try {
        console.log('Checking password_resets table structure...');
        
        // Add UNIQUE constraint if it doesn't exist
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 
                    FROM pg_constraint 
                    WHERE conname = 'password_resets_user_id_key'
                ) THEN 
                    ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_key UNIQUE (user_id);
                    RAISE NOTICE 'Added UNIQUE constraint to user_id in password_resets';
                ELSE
                    RAISE NOTICE 'UNIQUE constraint already exists';
                END IF;
            END $$;
        `);
        
        console.log('✅ Database fix complete');
    } catch (err) {
        console.error('❌ Error applying fix:', err.message);
        if (err.message.includes('contains duplicate values')) {
            console.log('⚠️ Duplicate values found. Cleaning up...');
            await pool.query(`
                DELETE FROM password_resets 
                WHERE id NOT IN (
                    SELECT MIN(id) 
                    FROM password_resets 
                    GROUP BY user_id
                );
            `);
            console.log('✅ Duplicates removed. Retrying constraint addition...');
            await pool.query('ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_key UNIQUE (user_id);');
            console.log('✅ UNIQUE constraint added.');
        }
    } finally {
        await pool.end();
    }
}

fix();
