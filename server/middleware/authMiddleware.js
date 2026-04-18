import jwt from 'jsonwebtoken';

const authMiddleware = async (req, res, next) => {
    try {
        let token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded;
        
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

export default authMiddleware;