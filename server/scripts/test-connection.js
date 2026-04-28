import { Pool } from 'pg';

async function check() {
  try {
    // Test direct connection to see what's in the DATABASE_URL
    const masterPool = new Pool({
      connectionString: process.env.MASTER_DATABASE_URL
    });
    
    console.log('Testing master database connection...');
    const tenantResult = await masterPool.query('SELECT database_url FROM tenants WHERE slug = $1', ['bq_receipt']);
    console.log('Tenant result:', tenantResult.rows);
    
    if (tenantResult.rows.length > 0) {
      const dbUrl = tenantResult.rows[0].database_url;
      console.log('Database URL:', dbUrl);
      
      const tenantPool = new Pool({ connectionString: dbUrl });
      const testResult = await tenantPool.query('SELECT 1 as test');
      console.log('Tenant DB test:', testResult.rows);
      
      // Check if receipts table exists
      const tableCheck = await tenantPool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'receipts') as exists");
      console.log('Receipts table exists:', tableCheck.rows[0].exists);
      
      // Count receipts
      const countResult = await tenantPool.query('SELECT COUNT(*) as count FROM receipts');
      console.log('Receipt count:', countResult.rows[0].count);
      
      // Show sample receipts if any
      if (parseInt(countResult.rows[0].count) > 0) {
        const sampleResult = await tenantPool.query('SELECT * FROM receipts ORDER BY created_at DESC LIMIT 5');
        console.log('Sample receipts:', sampleResult.rows);
      }
      
      await tenantPool.end();
    }
    
    await masterPool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();