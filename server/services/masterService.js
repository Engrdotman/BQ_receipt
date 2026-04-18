import { getMasterPool } from '../config/masterDb.js';
import { getTenantPool } from '../config/tenantDb.js';

class MasterService {
    static async findTenantBySlug(slug) {
        const pool = getMasterPool();
        const result = await pool.query(
            'SELECT * FROM tenants WHERE slug = $1 AND status = $2',
            [slug, 'active']
        );
        return result.rows[0];
    }

    static async findTenantById(tenantId) {
        const pool = getMasterPool();
        const result = await pool.query(
            'SELECT * FROM tenants WHERE tenant_id = $1',
            [tenantId]
        );
        return result.rows[0];
    }

    static async createTenant(data) {
        const pool = getMasterPool();
        const { tenant_id, name, slug, database_url } = data;
        const result = await pool.query(
            `INSERT INTO tenants (tenant_id, name, slug, database_url) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenant_id, name, slug, database_url]
        );
        return result.rows[0];
    }

    static async initializeTenantConnection(tenant) {
        try {
            return await getTenantPool(tenant.database_url);
        } catch (error) {
            console.error(`Failed to init tenant ${tenant.tenant_id}:`, error.message);
            throw error;
        }
    }

    static async getTenantPool(databaseUrl) {
        return getTenantPool(databaseUrl);
    }

    static async listTenants() {
        const pool = getMasterPool();
        const result = await pool.query('SELECT * FROM tenants ORDER BY created_at DESC');
        return result.rows;
    }
}

export default MasterService;