require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Schema } = mongoose;

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting configuration
const RATE_LIMIT_DELAY = 5000; // 5 seconds between requests
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// Request queue to manage API calls
let lastRequestTime = 0;
let isProcessing = false;
const requestQueue = [];

// Process queue function
const processQueue = async () => {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  const { prompt, resolve, reject } = requestQueue.shift();
  
  try {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
    }
    
    const response = await generateTextFromGemini(prompt);
    lastRequestTime = Date.now();
    resolve(response);
  } catch (error) {
    reject(error);
  } finally {
    isProcessing = false;
    if (requestQueue.length > 0) {
      processQueue();
    }
  }
};

// Middleware
// app.use(cors());
app.use(bodyParser.json());
// app.use(cors({
//   origin: `${process.env.REACT_APP_BASE_URL}`,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   credentials: true
// }));

const allowedOrigin = 'https://chat-bot-client-eight.vercel.app';

app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));


// MongoDB connection
mongoose.connect(process.env.MONGO_URI,{
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 60000,
  socketTimeoutMS: 60000
})
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// MongoDB schema for storing chat messages
const AiSchema = new Schema({
  role: String,
  content: String,
  intime: { type: Date, default: Date.now }
});

const Ai = mongoose.model('Ai', AiSchema);

// Function to interact with Gemini API
const generateTextFromGemini = async (userPrompt, retryCount = 0) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
  
  const requestBody = {
    contents: [{
      role: "user",
      parts: [{
        text: userPrompt
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
      topP: 0.8,
      topK: 40
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  try {
    console.log(`Attempt ${retryCount + 1} - Sending request to Gemini...`);
    const response = await axios.post(url, requestBody, { 
      timeout: 30000
    });

    if (!response.data.candidates || !response.data.candidates[0] || !response.data.candidates[0].content) {
      throw new Error("Invalid response format from Gemini API");
    }

    return {
      choices: [{
        message: {
          content: response.data.candidates[0].content.parts[0].text
        }
      }]
    };
  } catch (error) {
    console.error("Gemini API Error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });

    if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`Rate limit hit. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateTextFromGemini(userPrompt, retryCount + 1);
    }

    if (error.response?.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    
    throw error;
  }
};

// POST route to handle the user prompt and Gemini response
app.post('/generate-text1', async (req, res) => {
  console.log("Received request body:", req.body);
  
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // Add request to queue and wait for processing
    const response = await new Promise((resolve, reject) => {
      requestQueue.push({ prompt, resolve, reject });
      processQueue();
    });

    console.log("Gemini response received:", JSON.stringify(response, null, 2));

    // Save the user input and Gemini response to MongoDB
    const userMessage = new Ai({
      role: "user",
      content: prompt
    });
    await userMessage.save();
    console.log("User message saved to MongoDB");

    const geminiResponseMessage = new Ai({
      role: "Alan-Ai",
      content: response.choices[0].message.content
    });
    await geminiResponseMessage.save();
    console.log("AI response saved to MongoDB");

    res.json({
      userInput: prompt,
      time: userMessage.intime,
      gpt3Response: response.choices[0].message.content
    });
  } catch (error) {
    console.error("Detailed error in /generate-text1:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    
    if (error.response?.status === 429) {
      res.status(429).json({
        error: "Rate limit exceeded",
        details: "Please wait a moment and try again",
        retryAfter: RATE_LIMIT_DELAY / 1000
      });
    } else if (error.response) {
      res.status(error.response.status).json({
        error: "Gemini API Error",
        details: error.response.data
      });
    } else if (error.name === 'MongoError') {
      res.status(500).json({
        error: "Database Error",
        details: error.message
      });
    } else {
      res.status(500).json({
        error: "Error generating response",
        details: error.message
      });
    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    details: err.message
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = (req, res) => {
  res.end("Hello from Vercel!");
};

