// /netlify/functions/get-messages.js
const { getMessages } = require('./db-operations');

exports.handler = async (event) => {
  try {
    // Get query parameters
    const queryParams = event.queryStringParameters || {};
    const page = parseInt(queryParams.page) || 1;
    const pageSize = parseInt(queryParams.pageSize) || 10;
    
    // Get messages
    const result = await getMessages(page, pageSize);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error getting messages:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error retrieving messages' })
    };
  }
};