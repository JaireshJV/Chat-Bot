import React, { useState } from 'react';
import './App.css';

const TryOne =() => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // Function to handle user input
  const handleSendMessage = () => {
    if(input.trim() !== '') {
      const userMessage = { text: input, sender: 'user' };
      
      // Add user message
      setMessages(prevMessages => [...prevMessages, userMessage]);

      // Generate bot response
      setTimeout(() => {
        const botMessage = { 
          text: generateBotResponse(input), 
          sender: 'bot' 
        };
        setMessages(prevMessages => [...prevMessages, botMessage]);
      }, 500); // Add small delay for better UX

      // Clear input field after sending the message
      setInput('');
    }
  };

  // Function to handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Function to generate bot response
  const generateBotResponse = (userInput) => {
    const input = userInput.toLowerCase();
    
    if (input.includes('hello') || input.includes('hi')) {
      return "Hello! How can I help you today?";
    } else if (input.includes('how are you')) {
      return "I'm doing great, thank you for asking! How can I assist you?";
    } else if (input.includes('bye')) {
      return "Goodbye! Have a great day!";
    } else {
      return "I'm here to help! Could you please rephrase your question?";
    }
  };

  return (
    <div className="App">
      {/* <h1 style={{textAlign:"center"}}>CHAT BOT</h1> */}
      <div className="chat-container">
        <div className="messages">
          <h3>CHAT BOT &nbsp; 💬</h3>
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}`}>
              <p>{message.text}</p>
            </div>
          ))}
        </div>
        <div className="input-container">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default TryOne;
