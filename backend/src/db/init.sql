-- Flash Sale System Database Schema

-- Flash Sale table
CREATE TABLE IF NOT EXISTS flash_sale (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    total_stock INTEGER NOT NULL CHECK (total_stock >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    sale_id INTEGER NOT NULL REFERENCES flash_sale(id),
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- CRITICAL: Unique constraint to prevent duplicate purchases per user per sale
    CONSTRAINT unique_user_sale UNIQUE (user_id, sale_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_sale ON orders(user_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_orders_sale_id ON orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_flash_sale_times ON flash_sale(start_time, end_time);

-- Insert a default flash sale for testing (active for 24 hours from now, 100 items)
INSERT INTO flash_sale (name, start_time, end_time, total_stock)
VALUES (
    'Flash Sale Event',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '24 hours',
    100
) ON CONFLICT DO NOTHING;
