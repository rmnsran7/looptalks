// /netlify/functions/check-message.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cache for blocked words
let blockedWordsCache = [];
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Function to get blocked words with caching
async function getBlockedWords() {
  const now = Date.now();
  
  // If cache is valid, use it
  if (blockedWordsCache.length > 0 && (now - lastCacheTime) < CACHE_TTL) {
    return blockedWordsCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('blocked_words')
      .select('word');
    
    if (error) {
      console.error('Error fetching blocked words:', error);
      // If there's an error but we have a cache, use the cache
      if (blockedWordsCache.length > 0) {
        return blockedWordsCache;
      }
      return [];
    }
    
    // Update cache
    blockedWordsCache = data.map(item => item.word.toLowerCase());
    lastCacheTime = now;
    
    return blockedWordsCache;
  } catch (error) {
    console.error('Error in getBlockedWords:', error);
    // If there's an error but we have a cache, use the cache
    if (blockedWordsCache.length > 0) {
      return blockedWordsCache;
    }
    return [];
  }
}

// Function to check text with Perspective API
async function checkWithPerspectiveAPI(text) {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`,
      data: {
        comment: { text },
        languages: ['en'],
        requestedAttributes: {
          TOXICITY: {},
          SEVERE_TOXICITY: {},
          IDENTITY_ATTACK: {},
          INSULT: {},
          PROFANITY: {}
        }
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error calling Perspective API:', error.response?.data || error.message);
    throw error;
  }
}

exports.checkMessageContent = async (text) => {
  // Check if text exists and is a string
  if (!text || typeof text !== 'string') {
    return { valid: false, message: 'Message text is required' };
  }
  
  // Trim whitespace
  const trimmedText = text.trim();
  
  // Check length
  if (trimmedText.length < 10) {
    return { valid: false, message: 'Message must be at least 10 characters long' };
  }
  
  if (trimmedText.length > 500) {
    return { valid: false, message: 'Message cannot exceed 500 characters' };
  }
  
  // Check for HTML/script tags
  if (/<[^>]*>|<script|javascript:|on\w+=/i.test(trimmedText)) {
    return { valid: false, message: 'HTML or script tags are not allowed' };
  }
  
  // Check for SQL injection patterns
  if (/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b|--|;)/i.test(trimmedText)) {
    return { valid: false, message: 'Your message contains disallowed characters or patterns' };
  }
  
  // Get blocked words from database
  const blockedWords = await getBlockedWords();
  
  // Check for blocked words
  const lowerText = trimmedText.toLowerCase();
  
  // Check exact matches
  for (const word of blockedWords) {
    if (lowerText.includes(word)) {
      return { valid: false, message: 'Message contains inappropriate content' };
    }
  }
  
  // Check for words that might be disguised with special characters
  const normalizedText = lowerText
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\d/g, '')      // Remove numbers
    .replace(/(.)\1+/g, '$1'); // Reduce repeated characters (e.g., "baaad" -> "bad")
  
  for (const word of blockedWords) {
    if (normalizedText.includes(word)) {
      return { valid: false, message: 'Message contains inappropriate content' };
    }
  }
  
  // Check with Perspective API if key is available
  if (process.env.PERSPECTIVE_API_KEY) {
    try {
      const result = await checkWithPerspectiveAPI(trimmedText);
      
      // Check toxicity scores
      if (result.attributeScores.TOXICITY.summaryScore.value > 0.7 ||
          result.attributeScores.SEVERE_TOXICITY.summaryScore.value > 0.5 ||
          result.attributeScores.IDENTITY_ATTACK.summaryScore.value > 0.5 ||
          result.attributeScores.INSULT.summaryScore.value > 0.7 ||
          result.attributeScores.PROFANITY.summaryScore.value > 0.7) {
        return { valid: false, message: 'Message contains inappropriate content' };
      }
    } catch (error) {
      console.error('Error checking content with Perspective API:', error);
      // If Perspective API fails, we'll rely on our basic blocked word check
    }
  } else {
    console.log('Perspective API key not found, skipping API check');
  }
  
  // Sanitize text - replace @ with (at)
  const sanitizedText = trimmedText.replace(/@/g, '(at)');
  
  // Additional sanitization - escape special characters
  const finalText = sanitizedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  return { 
    valid: true,
    sanitizedText: finalText 
  };
};

// If running in Netlify Functions context
exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const { text } = JSON.parse(event.body);
    const result = await exports.checkMessageContent(text);

    return {
      statusCode: result.valid ? 200 : 400,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error in check-message function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error checking message content' })
    };
  }
};