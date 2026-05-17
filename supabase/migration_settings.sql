-- Dynamic System Settings Table

CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY DEFAULT 1,
    enforce_business_hours BOOLEAN DEFAULT true NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert the default configuration
INSERT INTO system_settings (id, enforce_business_hours) 
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;
