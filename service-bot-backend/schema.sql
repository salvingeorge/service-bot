-- Create database (run this manually if needed)
-- CREATE DATABASE service_bot;

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50),
  confidence DECIMAL(3,2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'bot')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Insert some sample data for testing
INSERT INTO conversations (category, confidence, status) VALUES 
  ('authentication', 0.95, 'completed'),
  ('billing', 0.87, 'active')
ON CONFLICT DO NOTHING;