const { pool, json, getIP } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, {});
  if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405);

  const { action, phone, page, referrer, utmSource, utmMedium, utmCampaign, device, browser, sessionId } = req.body || {};
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
};
