const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/service_bot',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Categories and their required information
const CATEGORIES = {
  authentication: {
    name: 'Authentication',
    required_fields: ['device', 'browser', 'error_message'],
    questions: [
      'What device are you using? (Desktop, Mobile, Tablet)',
      'What browser are you using?',
      'Are you getting any specific error messages?'
    ]
  },
  billing: {
    name: 'Billing',
    required_fields: ['email', 'charge_date', 'amount'],
    questions: [
      'What is your account email?',
      'What is the approximate date of the charge?',
      'What is the amount in question?'
    ]
  },
  technical: {
    name: 'Technical Issue',
    required_fields: ['browser', 'issue_start_date', 'steps_to_reproduce'],
    questions: [
      'What browser are you using?',
      'When did this issue start?',
      'Can you describe the exact steps that led to this problem?'
    ]
  },
  account: {
    name: 'Account Management',
    required_fields: ['email', 'specific_setting', 'tried_logout'],
    questions: [
      'What is your account email?',
      'What specific setting are you trying to change?',
      'Have you tried logging out and back in?'
    ]
  },
  general: {
    name: 'General Inquiry',
    required_fields: ['more_details'],
    questions: [
      'Can you provide more details about your issue?',
      'What would you like us to help you with specifically?'
    ]
  }
};

// AI Categorization function using Ollama
async function categorizeWithAI(message) {
  try {
    const prompt = `Analyze this customer service message and categorize it. 

Categories available:
- authentication: login, password, sign-in issues
- billing: payments, charges, invoices, subscription issues  
- technical: bugs, errors, app not working, crashes
- account: profile settings, account management, personal info
- general: everything else

Message: "${message}"

Respond with only a JSON object like this:
{
  "category": "authentication",
  "confidence": 0.95,
  "reasoning": "User mentions login issues"
}`;

    console.log('Sending request to Ollama...');
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.2:3b',
        prompt: prompt,
        stream: false,
        format: 'json'
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Ollama raw response:', data.response);
    
    // Parse the JSON response from Ollama
    let result;
    try {
      result = JSON.parse(data.response);
    } catch (parseError) {
      console.log('JSON parse failed, trying to extract JSON from response...');
      // Sometimes Ollama includes extra text, try to extract JSON
      const jsonMatch = data.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    }
    
    // Validate the result has required fields
    if (!result.category || !result.confidence) {
      throw new Error('Invalid response format from Ollama');
    }
    
    console.log('Parsed categorization:', result);
    return result;
    
  } catch (error) {
    console.error('Ollama categorization error:', error.message);
    console.log('Falling back to keyword matching...');
    // Fallback to simple keyword matching
    return fallbackCategorization(message);
  }
}

// Fallback categorization (keyword matching)
function fallbackCategorization(message) {
  const text = message.toLowerCase();
  
  if (text.includes('login') || text.includes('password') || text.includes('sign in') || text.includes('authenticate')) {
    return { category: 'authentication', confidence: 0.8, reasoning: 'Keyword match: login/password' };
  }
  if (text.includes('billing') || text.includes('payment') || text.includes('charge') || text.includes('invoice')) {
    return { category: 'billing', confidence: 0.8, reasoning: 'Keyword match: billing/payment' };
  }
  if (text.includes('bug') || text.includes('error') || text.includes('broken') || text.includes('not working')) {
    return { category: 'technical', confidence: 0.8, reasoning: 'Keyword match: technical issue' };
  }
  if (text.includes('account') || text.includes('profile') || text.includes('settings')) {
    return { category: 'account', confidence: 0.8, reasoning: 'Keyword match: account management' };
  }
  
  return { category: 'general', confidence: 0.5, reasoning: 'Default category' };
}

// Test Ollama connection
async function testOllamaConnection() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama is running. Available models:', data.models?.map(m => m.name) || []);
      return true;
    }
  } catch (error) {
    console.error('❌ Ollama connection failed:', error.message);
    console.log('Please make sure Ollama is running: ollama serve');
    console.log('And that you have downloaded a model: ollama pull llama3.2:3b');
    return false;
  }
}

// Routes

// Health check
app.get('/health', async (req, res) => {
  const ollamaStatus = await testOllamaConnection();
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    ollama_connected: ollamaStatus
  });
});

// Create a new conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { initial_message } = req.body;
    
    if (!initial_message || initial_message.trim() === '') {
      return res.status(400).json({ error: 'Initial message is required' });
    }
    
    // Create conversation in database
    const conversationResult = await pool.query(
      'INSERT INTO conversations (status, created_at) VALUES ($1, $2) RETURNING *',
      ['active', new Date()]
    );
    
    const conversation_id = conversationResult.rows[0].id;
    console.log(`Created conversation ${conversation_id}`);
    
    // Save initial message
    await pool.query(
      'INSERT INTO messages (conversation_id, content, sender, created_at) VALUES ($1, $2, $3, $4)',
      [conversation_id, initial_message, 'user', new Date()]
    );
    
    // Categorize the message
    console.log(`Categorizing message: "${initial_message}"`);
    const categorization = await categorizeWithAI(initial_message);
    
    // Save categorization
    await pool.query(
      'UPDATE conversations SET category = $1, confidence = $2 WHERE id = $3',
      [categorization.category, categorization.confidence, conversation_id]
    );
    
    // Get first follow-up question
    const categoryInfo = CATEGORIES[categorization.category];
    const followUpQuestion = categoryInfo.questions[0];
    
    // Save bot response
    await pool.query(
      'INSERT INTO messages (conversation_id, content, sender, created_at) VALUES ($1, $2, $3, $4)',
      [conversation_id, followUpQuestion, 'bot', new Date()]
    );
    
    res.json({
      conversation_id,
      categorization,
      follow_up_question: followUpQuestion,
      category_info: categoryInfo
    });
    
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add message to conversation
app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { id: conversation_id } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    // Save user message
    await pool.query(
      'INSERT INTO messages (conversation_id, content, sender, created_at) VALUES ($1, $2, $3, $4)',
      [conversation_id, content, 'user', new Date()]
    );
    
    // Get conversation info
    const convResult = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [conversation_id]
    );
    
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const conversation = convResult.rows[0];
    const categoryInfo = CATEGORIES[conversation.category];
    
    // Simple logic: ask next question or complete
    const messageCount = await pool.query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND sender = $2',
      [conversation_id, 'user']
    );
    
    const userMessageCount = parseInt(messageCount.rows[0].count);
    const nextQuestionIndex = userMessageCount - 1;
    
    let botResponse;
    let isComplete = false;
    
    if (nextQuestionIndex < categoryInfo.questions.length) {
      botResponse = categoryInfo.questions[nextQuestionIndex];
    } else {
      botResponse = `Thank you! I have all the information needed. Your ${categoryInfo.name} request has been categorized and will be routed to the appropriate team.`;
      isComplete = true;
      
      // Update conversation status
      await pool.query(
        'UPDATE conversations SET status = $1 WHERE id = $2',
        ['completed', conversation_id]
      );
    }
    
    // Save bot response
    await pool.query(
      'INSERT INTO messages (conversation_id, content, sender, created_at) VALUES ($1, $2, $3, $4)',
      [conversation_id, botResponse, 'bot', new Date()]
    );
    
    res.json({
      message: botResponse,
      is_complete: isComplete,
      category: conversation.category
    });
    
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation history
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const messagesResult = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );
    
    const conversationResult = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );
    
    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json({
      conversation: conversationResult.rows[0],
      messages: messagesResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  
  // Test Ollama connection on startup
  await testOllamaConnection();
});