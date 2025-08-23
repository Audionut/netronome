-- Add bufferbloat test results table
CREATE TABLE IF NOT EXISTS bufferbloat_tests (
    id BIGSERIAL PRIMARY KEY,
    ping_target TEXT NOT NULL,
    baseline_rtt DOUBLE PRECISION NOT NULL,
    baseline_jitter DOUBLE PRECISION NOT NULL,
    download_rtt DOUBLE PRECISION NOT NULL,
    download_jitter DOUBLE PRECISION NOT NULL,
    upload_rtt DOUBLE PRECISION NOT NULL,
    upload_jitter DOUBLE PRECISION NOT NULL,
    download_bufferbloat DOUBLE PRECISION NOT NULL,
    upload_bufferbloat DOUBLE PRECISION NOT NULL,
    download_bufferbloat_pct DOUBLE PRECISION NOT NULL,
    upload_bufferbloat_pct DOUBLE PRECISION NOT NULL,
    download_severity TEXT NOT NULL,
    upload_severity TEXT NOT NULL,
    download_speed DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    upload_speed DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    is_scheduled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bufferbloat_tests_created_at ON bufferbloat_tests(created_at);
CREATE INDEX IF NOT EXISTS idx_bufferbloat_tests_ping_target ON bufferbloat_tests(ping_target);
