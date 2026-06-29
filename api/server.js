/**
 * Sunrise PG — Analytics Backend Server
 *
 * Provides: /api/track, /api/track-call, /api/metrics
 * Database: PostgreSQL (Supabase/Neon/Railway)
 *
 * ENV VARS:
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *   ADMIN_API_KEY=your_secret_key
 *   PORT=3001 (optional)
 *
 * DEPLOY: Vercel (as serverless), Railway, Render, or any Node host.
 *         For Vercel, convert routes to /api/*.js files.
 */

const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const PORT = process.env.PORT || 3001;
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function getIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket.remoteAddress || null);
}

function isAuthed(req, url) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const [, token] = authHeader.split(' ');
    if (token === ADMIN_KEY + 'nimda') return true;
  }
  if (url.searchParams.get('key') === ADMIN_KEY + 'nimda') return true;
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') { json(res, {}); return; }

  // ===== POST /api/track =====
  if (req.method === 'POST' && url.pathname === '/api/track') {
    const body = await parseBody(req);
    const { path, referrer, utmSource, utmMedium, utmCampaign, device, browser, sessionId } = body;
    if (!path || !sessionId) return json(res, { ok: false }, 400);
    if (path.startsWith('/metrics') || path.startsWith('/api/')) return json(res, { ok: true });

    const ip = getIP(req);
    const country = req.headers['x-vercel-ip-country'] || null;

    try {
      await pool.query(
        `INSERT INTO page_views (path, referrer, utm_source, utm_medium, utm_campaign, device, browser, country, ip, session_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [path?.slice(0,500), referrer?.slice(0,1000)||null, utmSource?.slice(0,200)||null,
         utmMedium?.slice(0,200)||null, utmCampaign?.slice(0,200)||null,
         device?.slice(0,50)||null, browser?.slice(0,50)||null, country, ip?.slice(0,45)||null, sessionId?.slice(0,100)]
      );
      json(res, { ok: true });
    } catch (err) {
      console.error('[track]', err.message);
      json(res, { ok: false }, 500);
    }
    return;
  }

  // ===== POST /api/track-call =====
  if (req.method === 'POST' && url.pathname === '/api/track-call') {
    const body = await parseBody(req);
    const { action, phone, page, referrer, utmSource, utmMedium, utmCampaign, device, browser, sessionId } = body;
    if (!phone || !page || !sessionId) return json(res, { ok: false }, 400);

    const ip = getIP(req);
    const country = req.headers['x-vercel-ip-country'] || null;

    try {
      await pool.query(
        `INSERT INTO call_clicks (action, phone, page, referrer, utm_source, utm_medium, utm_campaign, device, browser, country, ip, session_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [action?.slice(0,30)||'call_click', phone?.slice(0,20), page?.slice(0,500),
         referrer?.slice(0,1000)||null, utmSource?.slice(0,200)||null,
         utmMedium?.slice(0,200)||null, utmCampaign?.slice(0,200)||null,
         device?.slice(0,50)||null, browser?.slice(0,50)||null, country, ip?.slice(0,45)||null, sessionId?.slice(0,100)]
      );
      json(res, { ok: true });
    } catch (err) {
      console.error('[track-call]', err.message);
      json(res, { ok: false }, 500);
    }
    return;
  }

  // ===== GET /api/metrics =====
  if (req.method === 'GET' && url.pathname === '/api/metrics') {
    if (!isAuthed(req, url)) return json(res, { error: 'Unauthorised.' }, 401);

    const hoursParam = url.searchParams.get('hours');
    const daysParam = parseInt(url.searchParams.get('days') || '30', 10);
    const totalHours = hoursParam
      ? Math.min(Math.max(1, parseInt(hoursParam, 10)), 8760)
      : Math.min(Math.max(1, daysParam), 365) * 24;
    const days = totalHours / 24;
    const since = new Date(Date.now() - totalHours * 3600000);

    try {
      const [
        totalViews, uniqueSessions, topPages, topReferrers,
        deviceBreakdown, browserBreakdown, countryBreakdown, ipBreakdown,
        utmSources, dailyViews,
        totalCallClicks, callsByPage, callsByAction, dailyCalls, recentCalls
      ] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int as c FROM page_views WHERE created_at >= $1`, [since]).then(r => r.rows[0].c),
        pool.query(`SELECT COUNT(DISTINCT session_id)::int as c FROM page_views WHERE created_at >= $1`, [since]).then(r => r.rows[0].c),
        pool.query(`SELECT path, COUNT(*)::int as views FROM page_views WHERE created_at >= $1 GROUP BY path ORDER BY views DESC LIMIT 20`, [since]).then(r => r.rows),
        pool.query(`SELECT referrer, COUNT(*)::int as views FROM page_views WHERE created_at >= $1 AND referrer IS NOT NULL AND referrer != '' GROUP BY referrer ORDER BY views DESC LIMIT 15`, [since]).then(r => r.rows),
        pool.query(`SELECT COALESCE(device,'unknown') as device, COUNT(*)::int as count FROM page_views WHERE created_at >= $1 GROUP BY device ORDER BY count DESC`, [since]).then(r => r.rows),
        pool.query(`SELECT COALESCE(browser,'unknown') as browser, COUNT(*)::int as count FROM page_views WHERE created_at >= $1 GROUP BY browser ORDER BY count DESC`, [since]).then(r => r.rows),
        pool.query(`SELECT COALESCE(country,'unknown') as country, COUNT(*)::int as count FROM page_views WHERE created_at >= $1 GROUP BY country ORDER BY count DESC LIMIT 15`, [since]).then(r => r.rows),
        pool.query(`SELECT COALESCE(ip,'unknown') as ip, COUNT(*)::int as count FROM page_views WHERE created_at >= $1 GROUP BY ip ORDER BY count DESC LIMIT 20`, [since]).then(r => r.rows),
        pool.query(`SELECT utm_source, COUNT(*)::int as count FROM page_views WHERE created_at >= $1 AND utm_source IS NOT NULL GROUP BY utm_source ORDER BY count DESC LIMIT 10`, [since]).then(r => r.rows),
        pool.query(`SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*)::int as views FROM page_views WHERE created_at >= $1 GROUP BY date ORDER BY date ASC`, [since]).then(r => r.rows),
        pool.query(`SELECT COUNT(*)::int as c FROM call_clicks WHERE created_at >= $1`, [since]).then(r => r.rows[0].c).catch(() => 0),
        pool.query(`SELECT page, COUNT(*)::int as count FROM call_clicks WHERE created_at >= $1 GROUP BY page ORDER BY count DESC LIMIT 15`, [since]).then(r => r.rows).catch(() => []),
        pool.query(`SELECT COALESCE(action,'call_click') as action, COUNT(*)::int as count FROM call_clicks WHERE created_at >= $1 GROUP BY action ORDER BY count DESC`, [since]).then(r => r.rows).catch(() => []),
        pool.query(`SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count FROM call_clicks WHERE created_at >= $1 GROUP BY date ORDER BY date ASC`, [since]).then(r => r.rows).catch(() => []),
        pool.query(`SELECT COALESCE(action,'call_click') as action, session_id, phone, page, COALESCE(device,'') as device, COALESCE(browser,'') as browser, COALESCE(ip,'') as ip, COALESCE(country,'') as country, created_at FROM call_clicks WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 50`, [since]).then(r => r.rows).catch(() => []),
      ]);

      json(res, {
        period: { days, since: since.toISOString() },
        traffic: { totalViews, uniqueSessions, topPages, topReferrers, devices: deviceBreakdown, browsers: browserBreakdown, countries: countryBreakdown, ips: ipBreakdown, utmSources, daily: dailyViews },
        callClicks: { total: totalCallClicks, byPage: callsByPage, byAction: callsByAction, daily: dailyCalls, recent: recentCalls },
      });
    } catch (err) {
      console.error('[metrics]', err.message);
      json(res, { error: 'Failed to fetch metrics.' }, 500);
    }
    return;
  }

  // ===== POST /api/setup — run schema via API call =====
  if (req.method === 'POST' && url.pathname === '/api/setup') {
    if (!isAuthed(req, url)) return json(res, { error: 'Unauthorised.' }, 401);

    const schema = `
      CREATE TABLE IF NOT EXISTS page_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        path VARCHAR(500) NOT NULL,
        referrer VARCHAR(1000),
        utm_source VARCHAR(200),
        utm_medium VARCHAR(200),
        utm_campaign VARCHAR(200),
        device VARCHAR(50),
        browser VARCHAR(50),
        country VARCHAR(10),
        ip VARCHAR(45),
        session_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS call_clicks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action VARCHAR(30) DEFAULT 'call_click',
        phone VARCHAR(20) NOT NULL,
        page VARCHAR(500) NOT NULL,
        referrer VARCHAR(1000),
        utm_source VARCHAR(200),
        utm_medium VARCHAR(200),
        utm_campaign VARCHAR(200),
        device VARCHAR(50),
        browser VARCHAR(50),
        country VARCHAR(10),
        ip VARCHAR(45),
        session_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
      CREATE INDEX IF NOT EXISTS idx_pv_session ON page_views(session_id);
      CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path);
      CREATE INDEX IF NOT EXISTS idx_cc_created ON call_clicks(created_at);
      CREATE INDEX IF NOT EXISTS idx_cc_action ON call_clicks(action);
    `;

    try {
      await pool.query(schema);
      json(res, { ok: true, message: 'Database schema created successfully.' });
    } catch (err) {
      console.error('[setup]', err.message);
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // 404
  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => console.log(`Sunrise PG Analytics running on :${PORT}`));
