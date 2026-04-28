import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function setupTenantDb() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    console.log('Connecting to tenant DB:', connectionString.substring(0, 50) + '...');
    
    const pool = new Pool({ connectionString });
    
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to tenant database');
    
    // Create receipts table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        receipt_id VARCHAR(50) UNIQUE,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        payment_method TEXT,
        imei_number TEXT,
        items JSONB,
        total_amount DECIMAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Ensured receipts table exists');
    
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM receipts');
    console.log('📊 Current receipt count:', countResult.rows[0].count);
    
    await pool.end();
    console.log('✅ Tenant database setup complete');
  } catch (error) {
    console.error('❌ Error setting up tenant DB:', error.message);
  }
}

setupTenantDb();