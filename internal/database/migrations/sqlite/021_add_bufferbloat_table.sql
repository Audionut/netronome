-- Add bufferbloat test results table
CREATE TABLE IF NOT EXISTS bufferbloat_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ping_target TEXT NOT NULL,
    baseline_rtt REAL NOT NULL,
    baseline_jitter REAL NOT NULL,
    download_rtt REAL NOT NULL,
    download_jitter REAL NOT NULL,
    upload_rtt REAL NOT NULL,
    upload_jitter REAL NOT NULL,
    download_bufferbloat REAL NOT NULL,
    upload_bufferbloat REAL NOT NULL,
    download_bufferbloat_pct REAL NOT NULL,
    upload_bufferbloat_pct REAL NOT NULL,
    download_severity TEXT NOT NULL,
    upload_severity TEXT NOT NULL,
    download_speed REAL NOT NULL DEFAULT 0.0,
    upload_speed REAL NOT NULL DEFAULT 0.0,
    is_scheduled BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bufferbloat_tests_created_at ON bufferbloat_tests(created_at);
CREATE INDEX IF NOT EXISTS idx_bufferbloat_tests_ping_target ON bufferbloat_tests(ping_target);
