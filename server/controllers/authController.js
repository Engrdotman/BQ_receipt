import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

class AuthController {
    static async login(req, res) {
        try {
            const { username, password } = req.body;
            const user = await User.findByUsername(username);

            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
        
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                process.env.JWT_SECRET || 'secret',
                { expiresIn: '24h' }
            );

            res.json({ token, user: { username: user.username, role: user.role } });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Login failed' });
        }
    }
}

export default AuthController;
