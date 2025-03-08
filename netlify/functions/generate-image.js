const Jimp = require('jimp');

exports.handler = async function(event, context) {
  try {
    const { text, postId, time } = JSON.parse(event.body);
    
    // Validate input
    if (!text || !postId || !time) {
      return {
        statusCode: 400,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ error: "Missing required parameters" })
      };
    }

    // Create dark gray background image
    const image = new Jimp(1080, 1080, 0x1A1A1AFF);
    
    // Load fonts
    const [font, timeFont] = await Promise.all([
      Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
      Jimp.loadFont(Jimp.FONT_SANS_16_WHITE)
    ]);

    // Draw header with bottom border
    image.scan(0, 0, 1080, 100, (x, y, idx) => {
      image.bitmap.data.writeUInt32BE(0x0F0F0FFF, idx);
    });
    // White bottom border (2px thick)
    image.scan(0, 98, 1080, 2, (x, y, idx) => {
      image.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx);
    });

    // Add header text
    image.print(font, 40, 30, `#${postId}`);
    const pageName = '@LoopTalks';
    const pageNameX = 1080 - Jimp.measureText(font, pageName) - 40;
    image.print(font, pageNameX, 30, pageName);

    // Enhanced text wrapping with line break support
    const wrapText = (text, maxWidth) => {
      const paragraphs = text.split('\n');
      const allLines = [];
      
      paragraphs.forEach(paragraph => {
        const words = paragraph.split(' ');
        let currentLine = '';
        
        words.forEach(word => {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const width = Jimp.measureText(font, testLine);
          
          if (width <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) allLines.push(currentLine);
            currentLine = word;
          }
        });
        
        if (currentLine) allLines.push(currentLine);
      });

      return allLines;
    };

    // Bubble parameters
    const padding = 40;
    const maxTextWidth = 800;
    const lineHeight = 45;
    const bubbleColor = 0xFE2C55FF;
    const cornerRadius = 30;

    // Wrap text and calculate bubble size
    const lines = wrapText(text, maxTextWidth);
    const lineWidths = lines.map(line => Jimp.measureText(font, line));
    const maxLineWidth = Math.max(...lineWidths);
    const bubbleWidth = Math.min(maxLineWidth + padding * 2, 1000);
    const bubbleHeight = lines.length * lineHeight + padding * 2;
    
    // Center bubble position (both axes)
    const bubbleX = (1080 - bubbleWidth) / 2;
    const verticalCenter = 100 + (980 - bubbleHeight) / 2; // 980 = 1080 - 100 (header height)
    const bubbleY = Math.max(100, verticalCenter);

    // Draw dynamic rounded rectangle bubble
    image.scanQuiet(bubbleX, bubbleY, bubbleWidth, bubbleHeight, (x, y, idx) => {
      const localX = x - bubbleX;
      const localY = y - bubbleY;
      
      const inHorizontal = localX >= cornerRadius && localX <= bubbleWidth - cornerRadius;
      const inVertical = localY >= cornerRadius && localY <= bubbleHeight - cornerRadius;
      
      if (inHorizontal || inVertical) {
        image.bitmap.data.writeUInt32BE(bubbleColor, idx);
        return;
      }
      
      const dx = Math.min(localX, bubbleWidth - localX);
      const dy = Math.min(localY, bubbleHeight - localY);
      
      if (Math.sqrt((dx - cornerRadius)**2 + (dy - cornerRadius)**2) <= cornerRadius) {
        image.bitmap.data.writeUInt32BE(bubbleColor, idx);
      }
    });

    // Add text to bubble
    lines.forEach((line, index) => {
      const textX = bubbleX + padding;
      const textY = bubbleY + padding + (index * lineHeight);
      image.print(font, textX, textY, line);
    });

    // Add timestamp below bubble (right aligned)
    const timeTextWidth = Jimp.measureText(timeFont, time);
    const timeX = bubbleX + bubbleWidth - timeTextWidth;
    const timeY = bubbleY + bubbleHeight + 10;
    image.print(timeFont, timeX, timeY, time);

    // Convert to base64
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Image generation error:', error);
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: "Image generation failed",
        details: error.message
      })
    };
  }
};

// Local testing function
exports.generateImage = async (text, postId, time) => {
  const result = await exports.handler({
    body: JSON.stringify({ text, postId, time })
  });
  return result.statusCode === 200 
    ? { image: result.body }
    : { error: JSON.parse(result.body) };
};