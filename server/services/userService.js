import pool from '../config/db.js';

class UserService {
    static async findByUsername(username) {
        const query = 'SELECT * FROM users WHERE username = $1';
        const { rows } = await pool.query(query, [username]);
        return rows[0];
    }

    static async findById(id) {
        const query = 'SELECT * FROM users WHERE id = $1';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async create(username, password, role = 'admin') {
        const query = 'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *';
        const { rows } = await pool.query(query, [username, password, role]);
        return rows[0];
    }

    static async updateLastLogin(id) {
        const query = 'UPDATE users SET last_login = NOW() WHERE id = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }
}

export default UserService;