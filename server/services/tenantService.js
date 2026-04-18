import { createTenantPool, getTenantPool } from '../config/tenantDb.js';

class TenantService {
    static tenantPools = new Map();

    static async createTenant(tenantId, connectionString) {
        try {
            const pool = createTenantPool(tenantId, connectionString);
            this.tenantPools.set(tenantId, pool);
            return pool;
        } catch (error) {
            console.error('Error creating tenant pool:', error);
            throw error;
        }
    }

    static getTenantPool(tenantId) {
        const pool = this.tenantPools.get(tenantId);
        if (!pool) {
            throw new Error(`No pool found for tenant: ${tenantId}`);
        }
        return pool;
    }

    static async removeTenant(tenantId) {
        const pool = this.tenantPools.get(tenantId);
        if (pool) {
            await pool.end();
            this.tenantPools.delete(tenantId);
        }
    }

    static async testConnection(tenantId) {
        try {
            const pool = this.getTenantPool(tenantId);
            await pool.query('SELECT 1');
            return true;
        } catch (error) {
            console.error(`Tenant ${tenantId} connection test failed:`, error);
            return false;
        }
    }

    static listTenants() {
        return Array.from(this.tenantPools.keys());
    }
}

export default TenantService;