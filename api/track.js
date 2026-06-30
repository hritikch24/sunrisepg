const { pool, json, getIP } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, {});
  if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405);

  const { path, referrer, utmSource, utmMedium, utmCampaign, device, browser, sessionId } = req.body || {};
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
};
