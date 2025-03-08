// /netlify/functions/submit-message.js
const { checkMessageContent } = require('./check-message');
const { checkRateLimit, updateUserLastPost } = require('./rate-limiter');
const { insertMessage, getMessage } = require('./db-operations');
const { generateImage } = require('./generate-image');
const { postToInstagram } = require('./post-to-instagram');

exports.handler = async (event, context) => {
  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    console.log(`Method not allowed: ${event.httpMethod}`);
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'What are you doing. This is not allowed' })
    };
  }

  try {
    // Parse request body
    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
      console.log('Received request body:', JSON.stringify(parsedBody, null, 2));
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      console.error('Raw body received:', event.body);
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Invalid request body format',
          details: parseError.message
        })
      };
    }
    
    const { text } = parsedBody;
    
    if (!text) {
      console.error('Missing required field: text');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required field: text' })
      };
    }
    
    // Get user identifier (IP or user agent)
    const userIdentifier = event.headers['client-ip'] || 
                          event.headers['x-forwarded-for'] || 
                          event.headers['user-agent'];
    
    console.log('User identifier:', userIdentifier);
    
    // Check if message meets basic requirements
    console.log('Checking message content...');
    let contentCheck;
    try {
      contentCheck = await checkMessageContent(text);
    } catch (contentError) {
      console.error('Error checking message content:', contentError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Error validating message content',
          details: contentError.message
        })
      };
    }
    
    if (!contentCheck.valid) {
      console.log('Content check failed:', contentCheck.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: contentCheck.message })
      };
    }
    
    // Use the sanitized text instead of the original text
    const sanitizedText = contentCheck.sanitizedText || text;
    console.log('Sanitized text:', sanitizedText);
    
    // Check rate limit
    console.log('Checking rate limit...');
    let rateLimitCheck;
    try {
      rateLimitCheck = await checkRateLimit(userIdentifier);
    } catch (rateLimitError) {
      console.error('Error checking rate limit:', rateLimitError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Error checking rate limit',
          details: rateLimitError.message
        })
      };
    }
    
    if (!rateLimitCheck.allowed) {
      console.log('Rate limit exceeded for user:', userIdentifier);
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'You have to wait before posting a new message', 
          nextAllowedTime: rateLimitCheck.nextAllowedTime 
        })
      };
    }
    
    // Insert message into database
    console.log('Inserting message into database...');
    let messageId;
    try {
      messageId = await insertMessage({
        text: sanitizedText,
        userIdentifier,
        createdAt: new Date().toISOString()
      });
    } catch (dbError) {
      console.error('Database error inserting message:', dbError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to save your message',
          details: dbError.message
        })
      };
    }
    
    console.log('Message inserted with ID:', messageId);
    
    // Get full message details
    console.log('Retrieving message details...');
    let message;
    try {
      message = await getMessage(messageId);
    } catch (getMessageError) {
      console.error('Error retrieving message:', getMessageError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to retrieve message details',
          details: getMessageError.message
        })
      };
    }
    
    // Format time for display using Kamloops time (Pacific Time Zone)
    const timestamp = new Date(message.created_at);
    // Convert to Kamloops time (Pacific Time Zone)
    const kamloopsTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Vancouver',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(timestamp);
    
    console.log('Formatted time:', kamloopsTime);
    
    // Generate image from text
    console.log('Generating image for message:', message.post_id);
    let imageResult;
    try {
      imageResult = await generateImage(sanitizedText, message.post_id, kamloopsTime);
    } catch (imageError) {
      console.error('Error generating image:', imageError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to generate image for your message',
          details: imageError.message
        })
      };
    }
    
    if (!imageResult || !imageResult.image) {
      console.error('No image was returned from image generator');
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: `Failed to generate image - no image data returned. Data: "${sanitizedText}, ${message.id}, ${imageResult.image}"`
        })
      };
    }
    
    const imageBase64 = imageResult.image;
    console.log('Image generated successfully');
    
    // Post to Instagram
    console.log('Posting to Instagram...');
    let instagramResponse;
    try {
      instagramResponse = await postToInstagram(imageBase64, sanitizedText);
    } catch (instagramError) {
      console.error('Error posting to Instagram:', instagramError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to post to Instagram',
          details: instagramError.message
        })
      };
    }
    
    console.log('Instagram response:', JSON.stringify(instagramResponse, null, 2));
    
    // Update user's last post time
    console.log('Updating user last post time...');
    try {
      await updateUserLastPost(userIdentifier);
    } catch (updateError) {
      console.error('Error updating last post time:', updateError);
      // Continue execution even if this fails
    }
    
    // Update message with Instagram post ID if available
    if (instagramResponse && instagramResponse.id) {
      console.log('Updating message with Instagram post ID...');
      try {
        await updateMessageWithInstagramId(message.id, instagramResponse.id);
      } catch (updateError) {
        console.error('Failed to update message with Instagram ID:', updateError);
        // Continue execution even if this fails
      }
    } else {
      console.warn('No Instagram post ID received');
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Message posted successfully to Instagram',
        messageId,
        instagramPostId: instagramResponse?.id
      })
    };
  } catch (error) {
    console.error('Unhandled error processing message:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Server error processing your message',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

// Helper function to update message with Instagram post ID
async function updateMessageWithInstagramId(messageId, instagramPostId) {
  console.log(`Updating message ${messageId} with Instagram post ID ${instagramPostId}`);
  const { createClient } = require('@supabase/supabase-js');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  const { data, error } = await supabase
    .from('messages')
    .update({ instagram_post_id: instagramPostId })
    .eq('id', messageId);
  
  if (error) {
    console.error('Supabase error updating message:', error);
    throw error;
  }
  
  console.log('Message updated successfully with Instagram ID');
  return data;
}