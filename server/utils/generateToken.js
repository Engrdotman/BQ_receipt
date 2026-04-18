import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';

export const generateToken = (payload, expiry = JWT_EXPIRY) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: expiry });
};

export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

export const generateRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'refresh_secret', { expiresIn: '7d' });
};

export const decodeToken = (token) => {
    return jwt.decode(token);
};

export default { generateToken, verifyToken, generateRefreshToken, decodeToken };