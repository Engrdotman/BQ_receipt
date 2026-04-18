export const checkRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized. No user found.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Access denied. Required roles: ${roles.join(', ')}` });
        }

        next();
    };
};

export const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions) {
            return res.status(403).json({ error: 'Access denied. No permissions.' });
        }

        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({ error: `Permission denied: ${permission}` });
        }

        next();
    };
};

export default { checkRole, checkPermission };