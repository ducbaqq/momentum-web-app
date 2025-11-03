-- Check current database connection usage
-- Run this to see how many connections are being used

SELECT 
    datname,
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname IN ('dev', 'staging', 'momentum_collector', 'defaultdb')
GROUP BY datname
ORDER BY datname;

-- Check total connections across all databases
SELECT 
    count(*) as total_connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
    setting::int as max_connections
FROM pg_stat_activity
CROSS JOIN pg_settings WHERE name = 'max_connections'
GROUP BY setting;

-- Check connections by application name (if set)
SELECT 
    application_name,
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity
WHERE application_name IS NOT NULL
GROUP BY application_name
ORDER BY connections DESC;

