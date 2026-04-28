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

// CORS configuration - allow local and production origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
    'https://bq-receipt.vercel.app',
      'http://localhost:5500',
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:3000',
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

app.use("/api/receipts", receiptRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/master", masterRoutes);

app.get("/seed", async (req, res) => {
  try {
    console.log("=== SEEDING DATABASE ===");
    const masterPool = getMasterPool();
    
    // Create tables if they don't exist
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        database_url TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS master_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'super_admin',
        tenant_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);
    
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        UNIQUE(tenant_id, username)
      )
    `);

    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_type VARCHAR(20) DEFAULT 'client',
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked BOOLEAN DEFAULT FALSE
      )
    `);

    console.log("✅ Tables created/verified");
    
    // Fix: Add tenant_id column if it doesn't exist (migration for old schema)
    try {
      await masterPool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) UNIQUE`);
      await masterPool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name VARCHAR(100)`);
      await masterPool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(50) UNIQUE`);
      await masterPool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS database_url TEXT`);
      await masterPool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`);
      console.log("✅ Tenants table schema updated");
    } catch (migrateErr) {
      console.log("ℹ️ Migration note:", migrateErr.message);
    }
    
    // Fix: Add tenant_id to users table if missing
    try {
      await masterPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50)`);
      console.log("✅ Users table schema updated");
    } catch (migrateErr) {
      console.log("ℹ️ Users migration note:", migrateErr.message);
    }
    
    // Check environment variables
    if (!process.env.MASTER_PASSWORD || !process.env.DEFAULT_CLIENT_PASSWORD || !process.env.DATABASE_URL) {
      return res.send("❌ Error: MASTER_PASSWORD, DEFAULT_CLIENT_PASSWORD, and DATABASE_URL must be set in .env");
    }
    
    // 1. Create/update master user
    console.log("Seeding master user...");
    await masterPool.query(
      `INSERT INTO master_users (username, password, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (username) DO UPDATE SET password = $2`,
      [process.env.MASTER_USERNAME || 'master', process.env.MASTER_PASSWORD, 'super_admin']
    );
    console.log("✅ Master user seeded");
    
    // 2. Create/update tenant (ensure active status and correct database_url)
    console.log("Seeding tenant bq_receipt...");
    await masterPool.query(`
      INSERT INTO tenants (tenant_id, name, slug, database_url, status) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug) 
      DO UPDATE SET 
        database_url = EXCLUDED.database_url,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `, ['tenant_bq', 'BQ Receipt', 'bq_receipt', process.env.DATABASE_URL, 'active']);
    console.log("✅ Tenant seeded (active)");
    
    // 3. Create/update client user (this is the one you login with!)
    console.log("Seeding client user (admin) in master DB...");
    await masterPool.query(`
      INSERT INTO users (tenant_id, username, password, role) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, username) DO UPDATE SET password = $3
    `, ['tenant_bq', process.env.DEFAULT_CLIENT_USERNAME || 'admin', process.env.DEFAULT_CLIENT_PASSWORD, 'admin']);
    console.log("✅ Client user seeded in master DB");
    
    // Verify everything
    const tenantCheck = await masterPool.query("SELECT * FROM tenants WHERE slug = 'bq_receipt'");
    const userCheck = await masterPool.query("SELECT id, username, role, tenant_id FROM users WHERE tenant_id = 'tenant_bq' AND username = $1", [process.env.DEFAULT_CLIENT_USERNAME || 'admin']);
    const masterCheck = await masterPool.query("SELECT username, role FROM master_users WHERE username = $1", [process.env.MASTER_USERNAME || 'master']);
    
    res.send(`
✅ Seed completed successfully!

🔑 Login credentials (to access the app):
  Organization: bq_receipt
  Username: ${process.env.DEFAULT_CLIENT_USERNAME || 'admin'}
  Password: admin2026

📊 Database summary:
  - Master user: ${masterCheck.rows[0]?.username || 'NOT FOUND'} (${masterCheck.rows[0]?.role || 'N/A'})
  - Tenant: ${tenantCheck.rows[0]?.slug || 'NOT FOUND'} (status: ${tenantCheck.rows[0]?.status || 'N/A'})
  - Client user: ${userCheck.rows[0]?.username || 'NOT FOUND'} (role: ${userCheck.rows[0]?.role || 'N/A'})

💡 Next steps:
  1. Visit http://localhost:5000/debug-login to verify data
  2. Open the app in browser
  3. If the app uses a different API URL, set localStorage: api_url = 'http://localhost:5000/api'
  4. Login with the credentials above
`);
  } catch (error) {
    console.error("Seed error:", error);
    res.send("Seed error: " + error.message);
  }
});

// ✅ Test DB route
app.get("/test-db", async (req, res) => {
  try {
    console.log("=== CLIENT DB TEST ===");
    
    // Fix tables automatically
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_email TEXT");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_name TEXT");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_address TEXT");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_phone TEXT");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS payment_method TEXT");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS imei_number TEXT");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS items JSONB");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_amount DECIMAL");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_id VARCHAR(50) UNIQUE");
    await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role VARCHAR(20) DEFAULT 'admin'
        )
    `);

    // Show current users
    const userResult = await pool.query("SELECT id, username, role, LEFT(password, 30) as pwd_hash FROM users");
    console.log("Client DB users:", userResult.rows);
    
    // Create admin if doesn't exist
    const adminCheck = await pool.query("SELECT * FROM users WHERE username = 'admin'");
    if (adminCheck.rows.length === 0 && process.env.DEFAULT_CLIENT_PASSWORD) {
      const hashedPassword = process.env.DEFAULT_CLIENT_PASSWORD;
      await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", ["admin", hashedPassword, "admin"]);
      console.log("✅ Default admin user created with .env password hash");
    } else if (adminCheck.rows.length === 0) {
      // Fallback: create with known password
      const fallbackHash = '$2b$10$DNaC8VZtgnLtlbjQWjVxw.51gFQZXhZIHaoCy45i7NdVOEtpVIvNe';
      await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", ["admin", fallbackHash, "admin"]);
      console.log("✅ Default admin user created with fallback password: admin2026");
    } else {
      console.log("ℹ️ Admin user 'admin' already exists in database");
    }

    // Verify admin
    const verify = await pool.query("SELECT id, username, role FROM users WHERE username = 'admin'");
    console.log("Admin after setup:", verify.rows[0]);
    
    res.json({ 
      message: "Schema checked/updated & Admin user verified", 
      admin: verify.rows[0],
      allUsers: userResult.rows
    });
  } catch (err) {
    console.error("Test DB error:", err);
    res.status(500).json({ error: "Database operation failed: " + err.message });
  }
});

// 🔍 Debug login endpoint
app.get("/debug-login", async (req, res) => {
  try {
    const masterPool = getMasterPool();
    const { tenant, username } = req.query;
    
    console.log(`[DEBUG] Checking tenant="${tenant}", username="${username}"`);
    
    // Check tenant
    const tenantResult = await masterPool.query(
      'SELECT * FROM tenants WHERE slug = $1',
      [tenant || 'bq_receipt']
    );
    
    // Check users in that tenant
    const userResult = await masterPool.query(
      'SELECT id, username, role, tenant_id, LEFT(password, 30) as pwd_hash FROM users WHERE tenant_id = $1',
      [tenantResult.rows[0]?.tenant_id]
    );
    
    // Check all tenants for reference
    const allTenants = await masterPool.query('SELECT * FROM tenants');
    const allUsers = await masterPool.query('SELECT id, username, role, tenant_id FROM users');
    
    res.json({
      requested: { tenant: tenant || 'bq_receipt', username: username || 'admin' },
      tenant_found: tenantResult.rows[0] || null,
      users_in_tenant: userResult.rows,
      all_tenants: allTenants.rows,
      all_users: allUsers.rows
    });
  } catch (error) {
    console.error('[debug-login] Error:', error.message);
    res.status(500).json({ error: error.message });
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

// 🔍 Debug: Check master users
app.get("/master-users", async (req, res) => {
  try {
    const masterPool = getMasterPool();
    const result = await masterPool.query(`
      SELECT u.id, u.username, u.role, u.tenant_id, t.slug as tenant_slug, 
             LEFT(u.password, 30) as pwd_hash 
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.tenant_id
    `);
    const tenants = await masterPool.query("SELECT * FROM tenants");
    res.json({ master_users: result.rows, tenants: tenants.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/reset-admin", async (req, res) => {
  try {
    if (!process.env.DEFAULT_CLIENT_PASSWORD) {
      return res.status(500).json({ error: "DEFAULT_CLIENT_PASSWORD not set in .env" });
    }
    
    const masterPool = getMasterPool();
    
    // Reset admin password in MASTER database users table (this is what auth uses!)
    await masterPool.query(`
      INSERT INTO users (username, password, role, tenant_id) 
      VALUES ('admin', $1, 'admin', 'tenant_bq')
      ON CONFLICT (tenant_id, username) DO UPDATE SET password = $1
    `, [process.env.DEFAULT_CLIENT_PASSWORD]);
    
    res.json({ 
      message: "Admin password reset in MASTER database. Login with: bq_receipt / admin / admin2026",
      tip: "The admin user is in master_db.users table with tenant_id='tenant_bq'"
    });
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

const initDB = async () => {
    try {
        console.log("=== INITIALIZING CLIENT DATABASE ===");
        
        // Ensure receipts table structure
        await pool.query(`
            CREATE TABLE IF NOT EXISTS receipts (
                id SERIAL PRIMARY KEY,
                receipt_id VARCHAR(50) UNIQUE,
                customer_name TEXT,
                customer_email TEXT,
                customer_phone TEXT,
                customer_address TEXT,
                payment_method TEXT,
                imei_number TEXT,
                items JSONB,
                total_amount DECIMAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Receipts columns
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_id VARCHAR(50) UNIQUE");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_name TEXT");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_email TEXT");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_phone TEXT");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_address TEXT");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS payment_method TEXT");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS imei_number TEXT");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS items JSONB");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_amount DECIMAL");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        await pool.query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        
        // Ensure users table exists with proper columns
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);
        
        // Add missing columns to users if table already existed
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP");
        
        // Handle password_hash column if it exists (make it nullable or populate it)
        try {
            await pool.query("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL");
        } catch (e) {
            // password_hash column doesn't exist, that's fine
        }
        
        // Create admin if no users exist
        const userCount = await pool.query("SELECT COUNT(*) FROM users");
        if (parseInt(userCount.rows[0].count) === 0) {
            const passwordToUse = process.env.DEFAULT_CLIENT_PASSWORD || '$2b$10$DNaC8VZtgnLtlbjQWjVxw.51gFQZXhZIHaoCy45i7NdVOEtpVIvNe';
            const usernameToUse = process.env.DEFAULT_CLIENT_USERNAME || 'admin';
            
            // Fix: Check if tenant_id column exists to handle shared DB environments (like Railway)
            try {
                const hasTenantId = await pool.query(`
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'tenant_id'
                `);
                
                if (hasTenantId.rows.length > 0) {
                    await pool.query("INSERT INTO users (tenant_id, username, password, role) VALUES ($1, $2, $3, $4)", ['tenant_bq', usernameToUse, passwordToUse, "admin"]);
                    console.log(`✅ Default admin user created (${usernameToUse} / admin2026) with tenant_id='tenant_bq'`);
                } else {
                    await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", [usernameToUse, passwordToUse, "admin"]);
                    console.log(`✅ Default admin user created (${usernameToUse} / admin2026) without tenant_id`);
                }
            } catch (insertErr) {
                console.error("⚠️ Failed to insert default admin user:", insertErr.message);
            }
        } else {
            console.log("ℹ️ Users already exist in client database");
        }
        
        console.log("✅ Client database schema is up to date");
    } catch (err) {
        console.error("❌ Client DB Init Error:", err.message);
    }
};

const initMasterDB = async () => {
    try {
        console.log("=== INITIALIZING MASTER DATABASE ===");
        
        if (!process.env.MASTER_DATABASE_URL) {
            console.warn("⚠️ MASTER_DATABASE_URL not set in .env - using default local PostgreSQL");
        }
        
        await initializeMasterDatabase();
        
        // Show existing data
        const masterPool = getMasterPool();
        const tenants = await masterPool.query("SELECT slug, status FROM tenants LIMIT 5");
        const users = await masterPool.query("SELECT username, role, tenant_id FROM users LIMIT 5");
        const masterUsers = await masterPool.query("SELECT username, role FROM master_users LIMIT 5");
        
        console.log("📊 Master DB contents:");
        console.log("  Tenants:", tenants.rows.map(t => t.slug).join(', ') || '(none)');
        console.log("  Users:", users.rows.map(u => `${u.username}@${u.tenant_id}`).join(', ') || '(none)');
        console.log("  Master users:", masterUsers.rows.map(m => m.username).join(', ') || '(none)');
        
        console.log("✅ Master database initialized");
    } catch (err) {
        console.log("⚠️ Master DB not available:", err.message);
    }
};

// Initialize databases on startup
const startServer = async () => {
    // Initialize master database (tenants, users, etc.)
    await initMasterDB();
    
    // Initialize client database (receipts)
    await initDB();
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
};

startServer();
