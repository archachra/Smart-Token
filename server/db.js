import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'arnavchachra',
  password: process.env.PGPASSWORD || '',
  database: process.env.SMARTTOKEN_DB_NAME || 'smarttoken_db',
})

export default pool
