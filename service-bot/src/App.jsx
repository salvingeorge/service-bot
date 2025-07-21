import { useState } from 'react'
import './App.css'

const API_BASE_URL = 'http://localhost:3001/api'

function App() {
  const [messages, setMessages] = useState([
    { id: 1, text: "Hi! I'm here to help categorize your service request. What issue are you experiencing?", sender: 'bot' }
  ])
  
  const [currentInput, setCurrentInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [currentCategory, setCurrentCategory] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [isComplete, setIsComplete] = useState(false)

  // API call to create new conversation
  const createConversation = async (initialMessage) => {
    try {
      const response = await fetch(`${API_BASE_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initial_message: initialMessage })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create conversation')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error creating conversation:', error)
      throw error
    }
  }

  // API call to add message to existing conversation
  const addMessage = async (conversationId, content) => {
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content })
      })
      
      if (!response.ok) {
        throw new Error('Failed to add message')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error adding message:', error)
      throw error
    }
  }

  // Handle sending a message
  const handleSendMessage = async () => {
    if (currentInput.trim() === '' || isTyping || isComplete) return

    const userMessage = {
      id: Date.now(),
      text: currentInput,
      sender: 'user'
    }

    setMessages(prev => [...prev, userMessage])
    setIsTyping(true)
    
    const messageContent = currentInput
    setCurrentInput('')

    try {
      if (!conversationId) {
        // First message - create new conversation
        const result = await createConversation(messageContent)
        
        setConversationId(result.conversation_id)
        setCurrentCategory({
          category: result.categorization.category,
          confidence: result.categorization.confidence
        })

        const botMessage = {
          id: Date.now() + 1,
          text: result.follow_up_question,
          sender: 'bot'
        }
        
        setMessages(prev => [...prev, botMessage])
      } else {
        // Follow-up message
        const result = await addMessage(conversationId, messageContent)
        
        const botMessage = {
          id: Date.now() + 1,
          text: result.message,
          sender: 'bot'
        }
        
        setMessages(prev => [...prev, botMessage])
        
        if (result.is_complete) {
          setIsComplete(true)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      
      // Fallback error message
      const errorMessage = {
        id: Date.now() + 1,
        text: "Sorry, I'm having trouble connecting to the server. Please try again.",
        sender: 'bot'
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage()
    }
  }

  const startNewConversation = () => {
    setMessages([
      { id: 1, text: "Hi! I'm here to help categorize your service request. What issue are you experiencing?", sender: 'bot' }
    ])
    setCurrentInput('')
    setCurrentCategory(null)
    setConversationId(null)
    setIsComplete(false)
  }

  return (
    <div className="app">
      <div className="chat-container">
        <div className="chat-header">
          <h2>Service Request Assistant</h2>
          {currentCategory && (
            <div className="category-display">
              Category: <strong>{currentCategory.category}</strong> 
              ({Math.round(currentCategory.confidence * 100)}% confidence)
            </div>
          )}
          {isComplete && (
            <div className="completion-status">
              ✅ Request Completed - Ready for routing
            </div>
          )}
        </div>
        
        <div className="messages-container">
          {messages.map(message => (
            <div key={message.id} className={`message ${message.sender}`}>
              <div className="message-bubble">
                {message.text}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="message bot">
              <div className="message-bubble typing">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                AI is analyzing...
              </div>
            </div>
          )}
        </div>
        
        <div className="input-container">
          {isComplete ? (
            <button 
              onClick={startNewConversation} 
              className="new-conversation-button"
            >
              Start New Request
            </button>
          ) : (
            <>
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={conversationId ? "Your answer..." : "Describe your issue..."}
                className="message-input"
                disabled={isTyping}
              />
              <button 
                onClick={handleSendMessage} 
                className="send-button"
                disabled={isTyping || currentInput.trim() === ''}
              >
                Send
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App