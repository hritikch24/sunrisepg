const { pool, json, isAuthed } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, {});
  if (req.method !== 'GET') return json(res, { error: 'Method not allowed' }, 405);
  if (!isAuthed(req)) return json(res, { error: 'Unauthorised.' }, 401);

  const hoursParam = req.query?.hours;
  const daysParam = parseInt(req.query?.days || '30', 10);
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
};
