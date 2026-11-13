import './env.js'
import pg from 'pg'

const { Pool } = pg

const isProduction = process.env.NODE_ENV === 'production'
const databaseUrl = process.env.DATABASE_URL

let poolConfig = {}

if (databaseUrl) {
  const needsSsl = databaseUrl.includes('sslmode=require') ||
                   databaseUrl.includes('supabase.co') ||
                   databaseUrl.includes('neon.tech') ||
                   databaseUrl.includes('render.com') ||
                   isProduction
  poolConfig = {
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  }
} else {
  poolConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'arnavchachra',
    password: process.env.PGPASSWORD || '',
    database: process.env.SMARTTOKEN_DB_NAME || 'smarttoken_db',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  }
}

const pool = new Pool(poolConfig)

export default pool
