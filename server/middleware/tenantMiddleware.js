import jwt from 'jsonwebtoken';
import { getMasterPool } from '../config/masterDb.js';
import { getTenantPool } from '../config/tenantDb.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

/**
 * tenantMiddleware
 *
 * Secure multi-tenant authentication middleware.
 *
 * Flow:
 *  1. Extract Bearer token from Authorization header (or ?token= query param)
 *  2. Verify + decode JWT  →  { user_id, tenant_id, role, type }
 *  3. Reject any non-client tokens (master tokens cannot access tenant routes)
 *  4. Query master_db.tenants with tenant_id to get database_url securely
 *     (database_url is NEVER stored in the JWT)
 *  5. Open / reuse a pooled connection to the tenant's database
 *  6. Attach pool as req.tenantDb and decoded payload as req.user → next()
 */
export const tenantMiddleware = async (req, res, next) => {
    try {
        // ── Step 1: Extract token ──────────────────────────────────────────
        let token = req.headers['authorization']?.replace('Bearer ', '').trim();

        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        // ── Step 2: Verify JWT ─────────────────────────────────────────────
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired. Please log in again.' });
            }
            return res.status(401).json({ error: 'Invalid token.' });
        }

        // ── Step 3: Enforce client token type ─────────────────────────────
        if (decoded.type !== 'client') {
            return res.status(403).json({ error: 'Forbidden: invalid token type for this route.' });
        }

        const { tenant_id, user_id, role } = decoded;

        if (!tenant_id) {
            return res.status(400).json({ error: 'Token is missing tenant_id.' });
        }

        // ── Step 4: Securely fetch database_url from master DB ─────────────
        const masterPool = getMasterPool();

        const tenantResult = await masterPool.query(
            'SELECT database_url FROM tenants WHERE id = $1 AND status = $2',
            [tenant_id, 'active']
        );

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found or inactive.' });
        }

        const { database_url } = tenantResult.rows[0];

        // ── Step 5: Get (or create) pooled connection to tenant DB ─────────
        const tenantDb = await getTenantPool(database_url);

        // ── Step 6: Attach to request and continue ─────────────────────────
        req.tenantDb = tenantDb;
        req.user = { user_id, tenant_id, role, type: 'client' };

        next();
    } catch (error) {
        console.error('[tenantMiddleware] Unexpected error:', error.message);
        return res.status(500).json({ error: 'Authentication failed.' });
    }
};

/**
 * masterAuthMiddleware
 *
 * Protects master-admin routes.
 * Only accepts tokens of type 'master'.
 */
export const masterAuthMiddleware = (req, res, next) => {
    try {
        let token = req.headers['authorization']?.replace('Bearer ', '').trim();

        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired. Please log in again.' });
            }
            return res.status(401).json({ error: 'Invalid token.' });
        }

        if (decoded.type !== 'master') {
            return res.status(403).json({ error: 'Forbidden: master access required.' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        console.error('[masterAuthMiddleware] Error:', error.message);
        return res.status(500).json({ error: 'Authentication failed.' });
    }
};

export default tenantMiddleware;