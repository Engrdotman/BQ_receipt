import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const tenantPools = new Map();

const createPoolFromUrl = (connectionString) => {
    try {
        // Parse connection string to check for Railway environment
        const isRailway = process.env.RAILWAY_ENVIRONMENT === 'true' || 
                         process.env.RAILWAY_PROJECT_NAME || 
                         process.env.RAILWAY_SERVICE_NAME;
        
        // Railway PostgreSQL requires SSL
        const ssl = isRailway ? { rejectUnauthorized: false } : false;
        
        return new Pool({ 
            connectionString,
            ssl,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });
    } catch (error) {
        console.error('[TenantDB] Error creating pool:', error.message);
        throw error;
    }
};

export const getTenantPool = async (connectionString) => {
    if (!connectionString) {
        throw new Error('Connection string is required');
    }
    
    console.log('[TenantDB] connectionString type:', typeof connectionString);
    console.log('[TenantDB] connectionString value:', connectionString);
    
    if (!tenantPools.has(connectionString)) {
        const pool = createPoolFromUrl(connectionString);
        
        try {
            await pool.query('SELECT 1');
            tenantPools.set(connectionString, pool);
            console.log(`✅ Tenant DB connected`);
        } catch (error) {
            console.error(`❌ Failed to connect to tenant DB:`, error.message);
            throw new Error(`Failed to connect to tenant database: ${error.message}`);
        }
    }
    
    return tenantPools.get(connectionString);
};

export const closeTenantPool = async (connectionString) => {
    const pool = tenantPools.get(connectionString);
    if (pool) {
        await pool.end();
        tenantPools.delete(connectionString);
    }
};

export const closeAllPools = async () => {
    for (const [key, pool] of tenantPools) {
        await pool.end();
    }
    tenantPools.clear();
};

export default { getTenantPool, closeTenantPool, closeAllPools };