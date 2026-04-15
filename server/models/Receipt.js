import pool from '../config/db.js';

class Receipt {
    static async findAll() {
        const query = 'SELECT * FROM receipts ORDER BY created_at DESC';
        const { rows } = await pool.query(query);
        return rows;
    }

    static async findById(id) {
        const query = 'SELECT * FROM receipts WHERE id = $1';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async create(data) {
        const { receipt_id, customer_name, customer_email, items, total_amount } = data;
        const query = `
            INSERT INTO receipts (receipt_id, customer_name, customer_email, items, total_amount)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [receipt_id, customer_name, customer_email, JSON.stringify(items), total_amount];
        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async delete(id) {
        const query = 'DELETE FROM receipts WHERE id = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }
}

export default Receipt;
