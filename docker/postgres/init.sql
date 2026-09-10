SELECT 'CREATE DATABASE promotions_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'promotions_test')\gexec
