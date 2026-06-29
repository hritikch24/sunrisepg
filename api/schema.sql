-- Sunrise PG Analytics Database Schema
-- Run this on your PostgreSQL database (e.g., Supabase, Neon, Railway)

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

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pv_session ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path);
CREATE INDEX IF NOT EXISTS idx_cc_created ON call_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_cc_action ON call_clicks(action);
