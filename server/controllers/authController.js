import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/generateToken.js';
import { getMasterPool } from '../config/masterDb.js';

// ─────────────────────────────────────────────
//  MASTER LOGIN  (Super Admin → master_users)
// ─────────────────────────────────────────────
export const masterLogin = async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const masterPool = getMasterPool();

        const result = await masterPool.query(
            'SELECT * FROM master_users WHERE username = $1',
            [username]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // JWT: user_id, role, type — NO database_url
        const token = generateToken({
            user_id: user.id,
            username: user.username,
            role: user.role,
            type: 'master'
        }, '8h');

        await masterPool.query(
            'UPDATE master_users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        return res.json({
            token,
            user: {
                user_id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('[masterLogin] Error:', error.message);
        return res.status(500).json({ error: 'Login failed' });
    }
};

// ─────────────────────────────────────────────
//  CLIENT LOGIN  (Tenant user → users table)
//  Accepts: { username, password, tenant }
//  - tenant = slug (e.g. "bq_receipt")
//  - If no slug given, defaults to 'bq_receipt'
// ─────────────────────────────────────────────
export const login = async (req, res) => {
    const { username, password, tenant } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const tenantSlug = tenant || 'bq_receipt';
        return await tenantLogin(req, res, username, password, tenantSlug);
    } catch (error) {
        console.error('[login] Error:', error.message);
        return res.status(500).json({ error: 'Login failed' });
    }
};

// ─────────────────────────────────────────────
//  FORGOT PASSWORD
// ─────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
    const { username, tenant } = req.body;

    try {
        const masterPool = getMasterPool();

        let tenantId = null;
        if (tenant) {
            const tenantResult = await masterPool.query(
                'SELECT tenant_id FROM tenants WHERE slug = $1 AND status = $2',
                [tenant, 'active']
            );
            if (tenantResult.rows.length > 0) {
                tenantId = tenantResult.rows[0].tenant_id;
            }
        }

        let query = 'SELECT id FROM users WHERE username = $1';
        const params = [username];

        if (tenantId) {
            query += ' AND tenant_id = $2';
            params.push(tenantId);
        }

        const result = await masterPool.query(query, params);
        const user = result.rows[0];

        if (!user) {
            // Always return success to avoid username enumeration
            return res.json({ message: 'If the username exists, reset instructions will be sent.' });
        }

        const resetToken = generateToken({ id: user.id, username, type: 'reset' }, '15m');
        console.log(`[Password Reset] Token for ${username}: ${resetToken}`);

        await masterPool.query(
            `INSERT INTO password_resets (user_id, token, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
             ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = NOW() + INTERVAL '15 minutes'`,
            [user.id, resetToken]
        );

        return res.json({ message: 'Password reset instructions have been sent to your registered email.' });
    } catch (error) {
        console.error('[forgotPassword] Error:', error.message);
        return res.status(500).json({ error: 'Failed to process request' });
    }
};

// ─────────────────────────────────────────────
//  RESET PASSWORD
// ─────────────────────────────────────────────
export const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'secret');

        if (decoded.type !== 'reset') {
            return res.status(400).json({ error: 'Invalid token type' });
        }

        const masterPool = getMasterPool();

        const resetResult = await masterPool.query(
            'SELECT * FROM password_resets WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
            [decoded.id, token]
        );

        if (resetResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await masterPool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, decoded.id]
        );

        await masterPool.query(
            'DELETE FROM password_resets WHERE user_id = $1',
            [decoded.id]
        );

        return res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('[resetPassword] Error:', error.message);
        return res.status(400).json({ error: 'Invalid or expired token' });
    }
};

// ─────────────────────────────────────────────
//  INTERNAL: Tenant Login helper
//  1. Find tenant by slug in master_db.tenants
//  2. Find user by tenant_id in master_db.users
//  3. Validate password
//  4. Issue JWT with user_id, tenant_id, role ONLY
// ─────────────────────────────────────────────
async function tenantLogin(req, res, username, password, tenantSlug) {
    const masterPool = getMasterPool();

    // Step 1 — resolve tenant
    const tenantResult = await masterPool.query(
        'SELECT tenant_id FROM tenants WHERE slug = $1 AND status = $2',
        [tenantSlug, 'active']
    );

    if (tenantResult.rows.length === 0) {
        return res.status(401).json({ error: 'Organization not found or inactive' });
    }

    const { tenant_id } = tenantResult.rows[0];

    // Step 2 — find user in master users table scoped to tenant
    const userResult = await masterPool.query(
        'SELECT * FROM users WHERE tenant_id = $1 AND username = $2',
        [tenant_id, username]
    );

    const user = userResult.rows[0];

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Step 3 — validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Step 4 — issue JWT with NO database_url
    const token = generateToken({
        user_id: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        type: 'client'
    }, '8h');

    await masterPool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
    );

    return res.json({
        token,
        user: {
            user_id: user.id,
            tenant_id: user.tenant_id,
            role: user.role
        }
    });
}

export default { login, masterLogin, forgotPassword, resetPassword };