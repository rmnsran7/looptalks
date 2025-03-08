// /netlify/functions/db-operations.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.insertMessage = async (message) => {
  try {
    // Convert camelCase to snake_case for PostgreSQL
    const dbMessage = {
      text: message.text,
      user_identifier: message.userIdentifier,
      created_at: message.createdAt
    };
    
    const { data, error } = await supabase
      .from('messages')
      .insert([dbMessage])
      .select();
    
    if (error) {
      throw error;
    }
    
    return data[0].id;
  } catch (error) {
    console.error('Error inserting message:', error);
    throw error;
  }
};

exports.getMessage = async (id) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting message:', error);
    throw error;
  }
};

exports.getMessages = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;
    
    const { data, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      throw error;
    }
    
    return {
      messages: data,
      totalCount: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize)
    };
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
};

// Update a message with Instagram post ID
exports.updateMessageWithInstagramId = async (messageId, instagramPostId) => {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ instagram_post_id: instagramPostId })
      .eq('id', messageId);
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating message with Instagram ID:', error);
    throw error;
  }
};

// For Netlify Functions
exports.handler = async (event, context) => {
  try {
    // Handler code here
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "DB operations function" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};