// Simple script to ensure receipts table exists in tenant database
import { getMasterPool } from './config/masterDb.js';
import { getTenantPool } from './config/tenantDb.js';

async function setupReceiptsTable() {
  try {
    console.log('🔧 Setting up receipts table in tenant database...');
    
    // Get master pool to find tenant database URL
    const masterPool = getMasterPool();
    
    // Get the tenant database URL for bq_receipt
    const tenantResult = await masterPool.query(
      'SELECT database_url FROM tenants WHERE slug = $1', 
      ['bq_receipt']
    );
    
    if (tenantResult.rows.length === 0) {
      throw new Error('Tenant bq_receipt not found');
    }
    
    const databaseUrl = tenantResult.rows[0].database_url;
    console.log(`📡 Connecting to tenant database...`);
    
    // Get tenant pool
    const tenantPool = await getTenantPool(databaseUrl);
    
    // Create receipts table if it doesn't exist
    await tenantPool.query(`
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
    
    console.log('✅ Receipts table created/verified');
    
    // Check current count
    const countResult = await tenantPool.query('SELECT COUNT(*) as count FROM receipts');
    const count = parseInt(countResult.rows[0].count);
    console.log(`📊 Current receipt count: ${count}`);
    
    // Close the pool
    await tenantPool.end();
    
    console.log('🎉 Receipts table setup complete!');
    
  } catch (error) {
    console.error('❌ Failed to setup receipts table:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the setup
setupReceiptsTable();