// /netlify/functions/rate-limiter.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.checkRateLimit = async (userIdentifier) => {
  try {
    // Get user's last post time
    const { data, error } = await supabase
      .from('rate_limits')
      .select('last_post_time')
      .eq('user_identifier', userIdentifier)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }
    
    const now = new Date();
    
    // If user has posted before
    if (data && data.last_post_time) {
      const lastPostTime = new Date(data.last_post_time);
      const minutesSinceLastPost = (now - lastPostTime) / (1000 * 60);
      
      if (minutesSinceLastPost < 10) {
        const nextAllowedTime = new Date(lastPostTime.getTime() + 10 * 60 * 1000);
        return { 
          allowed: false, 
          nextAllowedTime
        };
      }
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // In case of error, allow the post (fail open for user experience)
    return { allowed: true };
  }
};

exports.updateUserLastPost = async (userIdentifier) => {
  try {
    const now = new Date().toISOString();
    
    // Try to update existing record
    const { data, error } = await supabase
      .from('rate_limits')
      .upsert({
        user_identifier: userIdentifier,
        last_post_time: now
      });
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating user last post time:', error);
    return false;
  }
};