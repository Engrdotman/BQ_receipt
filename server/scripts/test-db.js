import { getMasterPool } from './config/masterDb.js';

async function testMasterConnection() {
  try {
    console.log('Testing master database connection...');
    const masterPool = getMasterPool();
    
    // Test basic connection
    const testResult = await masterPool.query('SELECT 1 as test');
    console.log('Master DB connection test:', testResult.rows);
    
    // Check if tenants table exists and get bq_receipt
    const tenantResult = await masterPool.query(
      'SELECT database_url, slug, id FROM tenants WHERE slug = $1', 
      ['bq_receipt']
    );
    console.log('Tenant lookup result:', tenantResult.rows);
    
    if (tenantResult.rows.length > 0) {
      const tenant = tenantResult.rows[0];
      console.log('Found tenant:', {
        slug: tenant.slug,
        id: tenant.id,
        dbUrl: tenant.database_url ? '[SET]' : '[NOT SET]'
      });
      
      if (tenant.database_url) {
        // Test tenant database connection
        const { Pool } = await import('pg');
        const tenantPool = new Pool({ connectionString: tenant.database_url });
        
        try {
          const tenantTest = await tenantPool.query('SELECT 1 as test');
          console.log('Tenant DB connection test:', tenantTest.rows);
          
          // Check if receipts table exists
          const tableCheck = await tenantPool.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'receipts') as exists"
          );
          console.log('Receipts table exists:', tableCheck.rows[0].exists);
          
          if (tableCheck.rows[0].exists) {
            // Count receipts
            const countResult = await tenantPool.query('SELECT COUNT(*) as count FROM receipts');
            console.log('Receipt count:', countResult.rows[0].count);
            
            // Show recent receipts
            if (parseInt(countResult.rows[0].count) > 0) {
              const recentResult = await tenantPool.query(
                'SELECT * FROM receipts ORDER BY created_at DESC LIMIT 5'
              );
              console.log('Recent receipts count:', recentResult.rows.length);
              console.log('First receipt:', recentResult.rows[0]);
            }
          }
        } finally {
          await tenantPool.end();
        }
      }
    }
    
    await masterPool.$emit('end', []);
  } catch (error) {
    console.error('Database error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMasterConnection();