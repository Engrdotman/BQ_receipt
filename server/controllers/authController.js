import bcrypt from 'bcryptjs';
import { generateToken, verifyToken, generateRefreshToken } from '../utils/generateToken.js';
import { getMasterPool } from '../config/masterDb.js';

// ─────────────────────────────────────────────
//  REFRESH TOKEN
// ─────────────────────────────────────────────
export const refreshToken = async (req, res) => {
    const { refreshToken: rt } = req.body;

    if (!rt) {
        return res.status(401).json({ error: 'Refresh token required' });
    }

    try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(rt, process.env.JWT_REFRESH_SECRET || 'refresh_secret');

        const masterPool = getMasterPool();

        // Check if refresh token exists and is not revoked
        const tokenCheck = await masterPool.query(
            'SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = false',
            [rt]
        );

        if (tokenCheck.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const storedToken = tokenCheck.rows[0];

        // Check if expired
        if (new Date() > storedToken.expires_at) {
            // Mark as revoked
            await masterPool.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [storedToken.id]);
            return res.status(401).json({ error: 'Refresh token expired' });
        }

        // Check if user still exists based on user_type
        const userType = storedToken.user_type || decoded.type || 'client';
        let userResult;

        if (userType === 'master') {
            userResult = await masterPool.query(
                'SELECT id, username, role FROM master_users WHERE id = $1',
                [decoded.user_id]
            );
        } else {
            userResult = await masterPool.query(
                'SELECT id, username, role, tenant_id FROM users WHERE id = $1',
                [decoded.user_id]
            );
        }

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Revoke old refresh token
        await masterPool.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [storedToken.id]);

        // Generate new tokens
        const tokenPayload = {
            user_id: user.id,
            username: user.username,
            role: user.role,
            type: userType
        };

        if (userType === 'client') {
            tokenPayload.tenant_id = user.tenant_id;
        }

        const newAccessToken = generateToken(tokenPayload, '8h');
        const newRefreshToken = generateRefreshToken(tokenPayload);

        // Store new refresh token
        await masterPool.query(
            'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'7 days\')',
            [user.id, userType, newRefreshToken]
        );

        return res.json({
            token: newAccessToken,
            refreshToken: newRefreshToken,
            user: {
                user_id: user.id,
                username: user.username,
                role: user.role,
                tenant_id: user.tenant_id,
                type: userType
            }
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }
        console.error('[refreshToken] Error:', error.message);
        return res.status(500).json({ error: 'Failed to refresh token' });
    }
};

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

        const refreshToken = generateRefreshToken({
            user_id: user.id,
            username: user.username,
            role: user.role,
            type: 'master'
        });

        // Store refresh token
        await masterPool.query(
            'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'7 days\')',
            [user.id, 'master', refreshToken]
        );

        await masterPool.query(
            'UPDATE master_users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        return res.json({
            token,
            refreshToken,
            user: {
                user_id: user.id,
                username: user.username,
                role: user.role,
                type: 'master'
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

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;

        return res.json({ message: 'Password reset instructions have been sent to your registered email.', resetUrl });
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
    console.log(`[tenantLogin] Attempting login for user: ${username}, tenant: ${tenantSlug}`);
    
    try {
        const masterPool = getMasterPool();

        // Step 1 — resolve tenant
        const tenantResult = await masterPool.query(
            'SELECT id, tenant_id, name, slug, status FROM tenants WHERE slug = $1',
            [tenantSlug]
        );

        console.log('[tenantLogin] Tenant query result:', tenantResult.rows);

        if (tenantResult.rows.length === 0) {
            return res.status(401).json({ error: 'Organization not found or inactive' });
        }

        const tenant = tenantResult.rows[0];
        const tenant_id = tenant.id; // Use 'id' as tenant_id for users table
        const status = tenant.status;

        if (status !== 'active') {
            return res.status(401).json({ error: 'Organization not found or inactive' });
        }

        console.log('[tenantLogin] Resolved tenant_id (using id):', tenant_id);

        // Step 2 — find user in master users table scoped to tenant
        const userResult = await masterPool.query(
            'SELECT * FROM users WHERE tenant_id = $1 AND username = $2',
            [tenant_id, username]
        );

        console.log('[tenantLogin] User query result rows:', userResult.rows.length);

        const user = userResult.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('[tenantLogin] User found, comparing password...');

        // Step 3 — validate password
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('[tenantLogin] Password match result:', isMatch);
        
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

        const refreshToken = generateRefreshToken({
            user_id: user.id,
            username: user.username,
            role: user.role,
            tenant_id: user.tenant_id
        });

        console.log('[tenantLogin] Storing refresh token...');

        // Store refresh token in database
        await masterPool.query(
            'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'7 days\')',
            [user.id, 'client', refreshToken]
        );

        await masterPool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        console.log('[tenantLogin] Login successful');

        return res.json({
            token,
            refreshToken,
            user: {
                user_id: user.id,
                tenant_id: user.tenant_id,
                role: user.role,
                type: 'client'
            }
        });
    } catch (error) {
        console.error('[tenantLogin] Error:', error.message);
        console.error('[tenantLogin] Stack:', error.stack);
        return res.status(500).json({ error: 'Login failed: ' + error.message });
    }
}

export default { login, masterLogin, forgotPassword, resetPassword };