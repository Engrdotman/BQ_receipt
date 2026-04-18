import { getTenantPool } from '../config/tenantDb.js';

class ReceiptService {
    static async findAll(tenantDbOrUrl) {
        let pool;
        
        if (!tenantDbOrUrl) {
            throw new Error('Tenant database not configured');
        }
        
        if (typeof tenantDbOrUrl === 'string') {
            pool = await getTenantPool(tenantDbOrUrl);
        } else {
            pool = tenantDbOrUrl;
        }
        
        const query = 'SELECT * FROM receipts ORDER BY created_at DESC';
        const { rows } = await pool.query(query);
        console.log('[ReceiptService.findAll] Rows:', rows.length);
        return rows;
    }

    static async findById(tenantDbOrUrl, id) {
        let pool;
        
        if (!tenantDbOrUrl) {
            throw new Error('Tenant database not configured');
        }
        
        if (typeof tenantDbOrUrl === 'string') {
            pool = await getTenantPool(tenantDbOrUrl);
        } else {
            pool = tenantDbOrUrl;
        }
        
        const query = 'SELECT * FROM receipts WHERE id = $1';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async findByReceiptId(tenantDbOrUrl, receiptId) {
        let pool;
        
        if (!tenantDbOrUrl) {
            throw new Error('Tenant database not configured');
        }
        
        if (typeof tenantDbOrUrl === 'string') {
            pool = await getTenantPool(tenantDbOrUrl);
        } else {
            pool = tenantDbOrUrl;
        }
        
        const query = 'SELECT * FROM receipts WHERE receipt_id = $1';
        const { rows } = await pool.query(query, [receiptId]);
        return rows[0];
    }

    static async create(tenantDbOrUrl, data) {
        let pool;
        
        if (!tenantDbOrUrl) {
            throw new Error('Tenant database not configured');
        }
        
        if (typeof tenantDbOrUrl === 'string') {
            pool = await getTenantPool(tenantDbOrUrl);
        } else {
            pool = tenantDbOrUrl;
        }
        
        const { receipt_id, customer_name, customer_email, customer_phone, customer_address, payment_method, imei_number, items, total_amount } = data;
        const query = `
            INSERT INTO receipts (receipt_id, customer_name, customer_email, customer_phone, customer_address, payment_method, imei_number, items, total_amount)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [receipt_id, customer_name, customer_email, customer_phone, customer_address, payment_method, imei_number, JSON.stringify(items), total_amount];
        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async delete(tenantDbOrUrl, id) {
        let pool;
        
        if (!tenantDbOrUrl) {
            throw new Error('Tenant database not configured');
        }
        
        if (typeof tenantDbOrUrl === 'string') {
            pool = await getTenantPool(tenantDbOrUrl);
        } else {
            pool = tenantDbOrUrl;
        }
        
        const query = 'DELETE FROM receipts WHERE id = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async search(tenantDbOrUrl, searchTerm) {
        let pool;
        
        if (!tenantDbOrUrl) {
            throw new Error('Tenant database not configured');
        }
        
        if (typeof tenantDbOrUrl === 'string') {
            pool = await getTenantPool(tenantDbOrUrl);
        } else {
            pool = tenantDbOrUrl;
        }
        
        const query = `
            SELECT * FROM receipts 
            WHERE customer_name ILIKE $1 
               OR customer_email ILIKE $1 
               OR receipt_id ILIKE $1
            ORDER BY created_at DESC
        `;
        const { rows } = await pool.query(query, [`%${searchTerm}%`]);
        return rows;
    }
}

export default ReceiptService;