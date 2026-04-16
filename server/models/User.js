import pool from '../config/db.js';

class User {

    static async findByUsername(username) {
        const query = 'SELECT * FROM users WHERE username = $1';
        const { rows } = await pool.query(query, [username]);
        return rows[0];
    }

    static async create(username, password) {
        const query = 'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *';
        const { rows } = await pool.query(query, [username, password, 'admin']);
        return rows[0];
    }
}

export default User;
