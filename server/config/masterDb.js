import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const masterPool = new Pool({
    connectionString: process.env.MASTER_DATABASE_URL || process.env.DATABASE_URL,
});

export const getMasterPool = () => masterPool;

export const initializeMasterDatabase = async () => {
    try {
        const result = await masterPool.query(`
            SELECT to_regclass('public.tenants') as tenants,
                   to_regclass('public.master_users') as master_users
        `);
        
        if (!result.rows[0].tenants) {
            console.log("⚠️ Master tables not found. Run database/master.sql first.");
        } else {
            console.log("✅ Master database connected");
        }
    } catch (error) {
        console.error("❌ Master DB init error:", error.message);
    }
};

export default masterPool;