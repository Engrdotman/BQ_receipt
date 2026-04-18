import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/db.js";
import { getMasterPool, initializeMasterDatabase } from "./config/masterDb.js";
import receiptRoutes from "./routes/receiptRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import masterRoutes from "./routes/masterRoutes.js";
import bcrypt from "bcryptjs";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/receipts", receiptRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/master", masterRoutes);

app.get("/seed", async (req, res) => {
  try {
    const masterPool = getMasterPool();
    
    const hashedPassword = await bcrypt.hash('master2026', 10);
    await masterPool.query(
      'INSERT INTO master_users (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
      ['master', hashedPassword, 'super_admin']
    );
    
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:hertheydotun@localhost:7085/BQ_receiptdb';
    await masterPool.query(
      'INSERT INTO tenants (tenant_id, name, slug, database_url, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO NOTHING',
      ['tenant_bq', 'BQ Receipt', 'bq_receipt', dbUrl, 'active']
    );
    
    const clientPassword = await bcrypt.hash('admin2026', 10);
    await masterPool.query(
      'INSERT INTO users (tenant_id, username, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, username) DO NOTHING',
      ['tenant_bq', 'admin', clientPassword, 'admin']
    );
    
    res.send("✅ Seed done! Master: master/master2026 | Client: admin/admin2026 | Tenant: bq_receipt");
  } catch (error) {
    res.send("Seed error: " + error.message);
  }
});

// ✅ Test DB route
app.get("/test-db", async (req, res) => {
  try {
    // Check/Fix receipts table
    await pool.query(`
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_email TEXT;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_name TEXT;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_address TEXT;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_phone TEXT;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS payment_method TEXT;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS imei_number TEXT;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS items JSONB;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_amount DECIMAL;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_id VARCHAR(50) UNIQUE;
      ALTER TABLE receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'admin'
      );
    `);

    // Check if admin exists, if not create one
    const adminCheck = await pool.query("SELECT * FROM users WHERE username = 'admin'");
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash("$2a$10$kjsdfhksjdfhksjdfh...", 10);
      await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", ["admin", hashedPassword, "admin"]);
      console.log("✅ Default admin user created (admin / admin2026)");
    } else {
      console.log("ℹ️ Admin user 'admin' already exists in database");
    }

    // ✅ Test DB route
    const result = await pool.query("SELECT * FROM receipts LIMIT 1");
    res.json({ message: "Schema checked/updated & Admin user verified", sample: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database operation failed: " + err.message });
  }
});


app.get("/", (req, res) => {
  res.send("BQ Receipt Server running 🚀");
});

app.get("/check-admin", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, role, LEFT(password, 20) as pwd_hash FROM users");
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/reset-admin", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash("admin2026", 10);
    await pool.query(`
      INSERT INTO users (username, password, role) 
      VALUES ('admin', $1, 'admin')
      ON CONFLICT (username) DO UPDATE SET password = $1
    `, [hashedPassword]);
    res.json({ message: "Admin reset - use admin / admin2026" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ 404 Handler for undefined routes
app.use((req, res) => {
    res.status(404).json({ error: `Path ${req.originalUrl} not found` });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

const initDB = async () => {
    try {
        // Fix tables automatically
        await pool.query(`
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_email TEXT;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_name TEXT;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_address TEXT;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_phone TEXT;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS payment_method TEXT;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS imei_number TEXT;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS items JSONB;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_amount DECIMAL;
            ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_id VARCHAR(50) UNIQUE;
            
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'admin'
            );
        `);

        const adminCheck = await pool.query("SELECT * FROM users WHERE username = 'admin'");
        if (adminCheck.rows.length === 0) {
            const hashedPassword = await bcrypt.hash("admin2026", 10);
            await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", ["admin", hashedPassword, "admin"]);
            console.log("✅ Default admin user created (admin / admin2026)");
        } else {
            console.log("ℹ️ Admin user 'admin' already exists in database");
        }
        console.log("✅ Database schema is up to date");
    } catch (err) {
        console.error("❌ Database Init Error:", err.message);
    }
};

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
  await initMasterDB();
});

const initMasterDB = async () => {
    try {
        await initializeMasterDatabase();
        console.log("✅ Master database initialized");
    } catch (err) {
        console.log("⚠️ Master DB not available:", err.message);
    }
};

