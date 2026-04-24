import { getMasterPool } from './config/masterDb.js';

async function checkAndFix() {
  try {
    const masterPool = getMasterPool();
    console.log('Connected to master DB');
    
    // Check current tenant data
    const current = await masterPool.query('SELECT slug, database_url FROM tenants WHERE slug = $1', ['bq_receipt']);
    console.log('Current tenant data:', current.rows[0]);
    
    // Check if database_url matches current DATABASE_URL env var
    const envUrl = process.env.DATABASE_URL;
    const dbUrl = current.rows[0]?.database_url;
    console.log('ENV DATABASE_URL:', envUrl);
    console.log('DB database_url:', dbUrl);
    console.log('Match:', envUrl === dbUrl);
    
    if (envUrl && dbUrl !== envUrl) {
      console.log('Updating database_url to match ENV...');
      const result = await masterPool.query(
        'UPDATE tenants SET database_url = $1 WHERE slug = $2 RETURNING *',
        [envUrl, 'bq_receipt']
      );
      console.log('Updated:', result.rows[0]);
    } else {
      console.log('URLs already match or ENV not set');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAndFix();