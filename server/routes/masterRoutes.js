import express from 'express';
import bcrypt from 'bcryptjs';
import MasterService from '../services/masterService.js';
import { getMasterPool } from '../config/masterDb.js';
import { masterAuthMiddleware } from '../middleware/tenantMiddleware.js';

const router = express.Router();
// All protected routes below require a valid 'master' JWT
const auth = masterAuthMiddleware;

router.post('/register', auth, async (req, res, next) => {
    try {
        const { name, slug, database_url } = req.body;
        if (!name || !slug || !database_url) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const tenant_id = `tenant_${Date.now()}`;
        const tenant = await MasterService.createTenant({ tenant_id, name, slug, database_url });
        res.status(201).json(tenant);
    } catch (error) {
        console.error('Tenant registration error:', error);
        res.status(500).json({ error: 'Failed to register tenant' });
    }
});

router.get('/tenants', auth, async (req, res, next) => {
    try {
        const tenants = await MasterService.listTenants();
        res.json(tenants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list tenants' });
    }
});

router.post('/users', auth, async (req, res, next) => {
    try {
        const { username, password, role, tenant_id } = req.body;
        const pool = getMasterPool();
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO master_users (username, password, role, tenant_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, hashedPassword, role || 'admin', tenant_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('User creation error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

router.post('/seed', async (req, res) => {
    try {
        const pool = getMasterPool();
        
        // Check if master user exists
        const userCheck = await pool.query("SELECT * FROM master_users WHERE username = 'master'");
        if (userCheck.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('master2026', 10);
            await pool.query(
                'INSERT INTO master_users (username, password, role) VALUES ($1, $2, $3)',
                ['master', hashedPassword, 'super_admin']
            );
            console.log('✅ Master user created (master / master2026)');
        }
        
        // Check if bq_receipt tenant exists
        const tenantCheck = await pool.query("SELECT * FROM tenants WHERE slug = 'bq_receipt'");
        if (tenantCheck.rows.length === 0) {
            const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/bq_receiptdb';
            await pool.query(
                'INSERT INTO tenants (tenant_id, name, slug, database_url, status) VALUES ($1, $2, $3, $4, $5)',
                ['tenant_bq', 'BQ Receipt', 'bq_receipt', dbUrl, 'active']
            );
            console.log('✅ BQ Receipt tenant created');
        }
        
        res.json({ message: 'Seed completed' });
    } catch (error) {
        console.error('Seed error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/check', async (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;