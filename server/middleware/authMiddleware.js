import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Check query params for download route (where headers can't be set easily)
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded;
        
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admins only.' });
        }
        
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

export default authMiddleware;
