// /netlify/functions/post-to-instagram.js
const axios = require('axios');
const FormData = require('form-data');

exports.postToInstagram = async (imageBase64, caption) => {
  console.log('Starting Instagram post process...');
  console.log(`Caption length: ${caption.length} characters`);
  console.log(`Image data length: ${imageBase64.length} characters`);
  
  try {
    // Verify environment variables
    if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
      throw new Error('INSTAGRAM_ACCESS_TOKEN environment variable is missing');
    }
    
    if (!process.env.INSTAGRAM_ACCOUNT_ID) {
      throw new Error('INSTAGRAM_ACCOUNT_ID environment variable is missing');
    }
    
    console.log('Environment variables verified');
    console.log('Instagram Account ID:', process.env.INSTAGRAM_ACCOUNT_ID);
    console.log('Access Token (first 10 chars):', process.env.INSTAGRAM_ACCESS_TOKEN.substring(0, 10) + '...');
    
    // Step 1: Upload the image to a temporary storage service
    // For this example, we'll use imgbb.com which offers a simple API
    console.log('Step 1: Uploading image to temporary storage...');
    
    // You need to get an API key from https://api.imgbb.com/
    const imgbbApiKey = process.env.IMGBB_API_KEY || 'YOUR_IMGBB_API_KEY';
    
    // Create form data for imgbb upload
    const formData = new FormData();
    formData.append('key', imgbbApiKey);
    formData.append('image', imageBase64);
    
    // Upload to imgbb
    const imgbbResponse = await axios.post('https://api.imgbb.com/1/upload', formData, {
      headers: formData.getHeaders()
    });
    
    if (!imgbbResponse.data.success) {
      throw new Error('Failed to upload image to temporary storage');
    }
    
    const imageUrl = imgbbResponse.data.data.url;
    console.log('Image uploaded successfully. URL:', imageUrl);
    
    // Step 2: Create a media container using the image URL
    console.log('Step 2: Creating media container...');
    const createMediaResponse = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v17.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media`,
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
        image_url: imageUrl,
        caption: caption
      }
    });

    console.log('Media container response:', createMediaResponse.data);
    const creationId = createMediaResponse.data.id;
    
    if (!creationId) {
      throw new Error('Failed to get creation ID from Instagram API');
    }
    
    console.log('Media container created with ID:', creationId);

    // Step 3: Publish the container
    console.log('Step 3: Publishing media...');
    const publishResponse = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v17.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media_publish`,
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
        creation_id: creationId
      }
    });

    console.log('Publish response:', publishResponse.data);
    
    return {
      success: true,
      id: publishResponse.data.id
    };
  } catch (error) {
    console.error('Error posting to Instagram:');
    
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else {
      console.error(error);
    }
    
    throw new Error('Failed to post to Instagram: ' + (error.response?.data?.error?.message || error.message));
  }
};

// For Netlify Functions
exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
    
    const { imageBase64, caption } = JSON.parse(event.body);
    
    if (!imageBase64 || !caption) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }
    
    const result = await exports.postToInstagram(imageBase64, caption);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error in post-to-instagram function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error posting to Instagram', details: error.message })
    };
  }
};