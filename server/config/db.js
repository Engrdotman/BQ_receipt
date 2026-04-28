import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

console.log("Connecting to Client DB:", process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : "UNDEFINED");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

export default pool;
export const getPool = () => pool