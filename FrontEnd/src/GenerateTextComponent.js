import React, { useState, useRef, useEffect } from 'react';
import { MdCopyAll } from "react-icons/md";
import { MdVolumeUp, MdVolumeOff } from "react-icons/md";
import axios from 'axios';

const GenerateTextComponent = () => {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [femaleVoice, setFemaleVoice] = useState(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setError('Speech recognition error. Please try again.');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setError('Speech recognition is not supported in your browser.');
    }

    // Initialize speech synthesis
    speechSynthesisRef.current = window.speechSynthesis;
    
    // Load available voices and select a female voice
    const loadVoices = () => {
      const voices = speechSynthesisRef.current.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') || 
        voice.name.toLowerCase().includes('woman') ||
        voice.name.toLowerCase().includes('samantha') ||
        voice.name.toLowerCase().includes('zira')
      );
      setFemaleVoice(femaleVoice || voices[0]);
    };

    // Load voices when they become available
    if (speechSynthesisRef.current.getVoices().length) {
      loadVoices();
    } else {
      speechSynthesisRef.current.onvoiceschanged = loadVoices;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel();
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setError(null);
    setIsLoading(true);
    setRetryAfter(null);

    // Add user message to chat
    const userMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMessage]);
    setPrompt('');

    try {
      const res = await axios.post(`${process.env.REACT_APP_BASE_URL}/generate-text1`, { prompt });
      
      // Add AI response to chat
      const aiMessage = { 
        role: 'assistant', 
        content: res.data.gpt3Response,
        time: res.data.time
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      if (err.response?.status === 429) {
        const retrySeconds = err.response.data.retryAfter || 5;
        setRetryAfter(retrySeconds);
        setError(`Rate limit exceeded. Please try again in ${retrySeconds} seconds.`);
        
        setTimeout(() => {
          setError(null);
          setRetryAfter(null);
          handleSubmit(e);
        }, retrySeconds * 1000);
      } else {
        const errorMessage = err.response?.data?.error || 
                           err.response?.data?.details || 
                           'Error generating response';
        setError(errorMessage);
      }
      console.error('Error:', err.response?.data || err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const speakText = (text, index) => {
    if (speakingIndex === index) {
      // If already speaking, stop
      speechSynthesisRef.current.cancel();
      setSpeakingIndex(null);
      return;
    }

    // Stop any ongoing speech
    speechSynthesisRef.current.cancel();

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Set the female voice if available
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    // Set up event listeners
    utterance.onstart = () => setSpeakingIndex(index);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    // Speak the text
    speechSynthesisRef.current.speak(utterance);
  };

  const formatMessage = (content) => {
    // Split content into parts: text and code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).trim();
        const language = code.split('\n')[0].trim() || 'plaintext';
        const codeContent = code.split('\n').slice(1).join('\n');
        return (
          <div key={index} className="code-block">
            <div className="code-header">
              <span className="code-language">{language}</span>
              <button 
                className="copy-button"
                onClick={() => copyToClipboard(codeContent, `code-${index}`)}
              >
                {copiedIndex === `code-${index}` ? 'Copied!' : <MdCopyAll />}
              </button>
            </div>
            <pre><code>{codeContent}</code></pre>
          </div>
        );
      }
      return <p key={index}>{part}</p>;
    });
  };

  return (
    <div className="chat-container">
      <h1>Chatbot</h1>
      
      <div className="messages-container">
        {messages.map((message, index) => (
          <div 
            key={index} 
            className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}
          >
            <div className="message-content">
              {formatMessage(message.content)}
              {message.time && (
                <span className="message-time">
                  {new Date(message.time).toLocaleTimeString()}
                </span>
              )}
              {message.role === 'assistant' && (
                <div className="message-actions">
                  <button 
                    className="action-button"
                    onClick={() => copyToClipboard(message.content, index)}
                    title="Copy message"
                  >
                    {copiedIndex === index ? 'Copied!' : <MdCopyAll />}
                  </button>
                  <button 
                    className="action-button"
                    onClick={() => speakText(message.content, index)}
                    title={speakingIndex === index ? "Stop speaking" : "Speak message"}
                  >
                    {speakingIndex === index ? <MdVolumeOff /> : <MdVolumeUp />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message ai-message">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="error-message">
          <p>{typeof error === 'string' ? error : JSON.stringify(error)}</p>
          {retryAfter && (
            <p>Retrying in {retryAfter} seconds...</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-form">
        <div className="input-group">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your message or use voice input..."
            disabled={isLoading}
            className="prompt-input"
          />
          <button 
            type="button"
            onClick={toggleListening}
            className={`voice-button ${isListening ? 'listening' : ''}`}
            disabled={isLoading}
          >
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" />
            </svg>
          </button>
          <button 
            type="submit" 
            disabled={isLoading || !prompt.trim()}
            className="send-button"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .chat-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          margin-bottom: 20px;
          background-color: #f5f5f5;
          border-radius: 8px;
        }

        .message {
          margin-bottom: 15px;
          max-width: 80%;
        }

        .user-message {
          margin-left: auto;
          background-color: #007bff;
          color: white;
          border-radius: 15px 15px 0 15px;
          padding: 10px 15px;
        }

        .ai-message {
          margin-right: auto;
          background-color: white;
          border-radius: 15px 15px 15px 0;
          padding: 10px 15px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .message-content {
          position: relative;
        }

        .message-time {
          font-size: 0.7em;
          color: #666;
          display: block;
          margin-top: 5px;
          text-align: right;
        }

        .copy-button {
          position: absolute;
          top: 5px;
          right: 5px;
          background-color: #f0f0f0;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.8em;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-button:hover {
          background-color: #e0e0e0;
        }

        .code-block {
          background-color: #f8f9fa;
          border-radius: 6px;
          margin: 10px 0;
          overflow: hidden;
        }

        .code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background-color: #e9ecef;
          border-bottom: 1px solid #dee2e6;
        }

        .code-language {
          font-size: 0.8em;
          color: #6c757d;
          text-transform: uppercase;
        }

        .code-block pre {
          margin: 0;
          padding: 12px;
          overflow-x: auto;
        }

        .code-block code {
          font-family: 'Courier New', Courier, monospace;
          font-size: 0.9em;
          line-height: 1.4;
        }

        .typing-indicator {
          display: flex;
          gap: 5px;
          padding: 10px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background-color: #666;
          border-radius: 50%;
          animation: typing 1s infinite;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        .input-form {
          margin-top: auto;
        }

        .input-group {
          display: flex;
          gap: 10px;
        }

        .prompt-input {
          flex: 1;
          padding: 12px;
          border: 1px solid #ccc;
          border-radius: 20px;
          font-size: 16px;
          outline: none;
        }

        .prompt-input:focus {
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }

        .voice-button {
          padding: 12px;
          background-color: #f0f0f0;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .voice-button:hover:not(:disabled) {
          background-color: #e0e0e0;
        }

        .voice-button.listening {
          background-color: #ff4444;
          color: white;
          animation: pulse 1.5s infinite;
        }

        .voice-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        .send-button {
          padding: 12px 24px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.2s;
        }

        .send-button:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .send-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .error-message {
          color: #dc3545;
          margin: 10px 0;
          padding: 10px;
          border: 1px solid #dc3545;
          border-radius: 4px;
          background-color: #f8d7da;
        }

        .message-actions {
          position: absolute;
          top: 5px;
          right: 5px;
          display: flex;
          gap: 5px;
        }

        .action-button {
          background-color: #f0f0f0;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.8em;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-button:hover {
          background-color: #e0e0e0;
        }

        .action-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .action-button svg {
          width: 16px;
          height: 16px;
        }
      `}</style>
    </div>
  );
};

export default GenerateTextComponent;
