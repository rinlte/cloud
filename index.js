const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const CHANNEL_ID = process.env.CHANNEL_ID || '@your_storage_channel';
const WELCOME_VIDEO = 'https://t.me/sourceui/5';

// MongoDB Schema
const fileSchema = new mongoose.Schema({
  uniqueId: { type: String, required: true, unique: true },
  messageId: { type: Number, required: true },
  channelId: { type: String, required: true },
  uploadedBy: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

const File = mongoose.model('File', fileSchema);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected successfully');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Generate 12-digit unique ID
function generateUniqueId() {
  return Math.random().toString().slice(2, 14);
}

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    // Forward the welcome video from the channel
    await bot.copyMessage(chatId, 'sourceui', 5);
    
    // Send welcome message
    await bot.sendMessage(chatId, 
      'Welcome to our bot! 🌸 The ultimate cloud ☁️!', 
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Upload File', callback_data: 'help_upload' }],
            [{ text: '📥 Get File', callback_data: 'help_get' }],
            [{ text: '💡 Help', callback_data: 'help' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error in /start:', error);
    await bot.sendMessage(chatId, 'Welcome to our bot! 🌸 The ultimate cloud ☁️!');
  }
});

// Handle callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'help_upload') {
    await bot.sendMessage(chatId, 
      '📤 *Upload File*\n\n' +
      'Send any file with /upload command or tag the file with /upload\n\n' +
      'Example:\n' +
      '• Send file + /upload in caption\n' +
      '• Or reply to file with /upload',
      { parse_mode: 'Markdown' }
    );
  } else if (query.data === 'help_get') {
    await bot.sendMessage(chatId,
      '📥 *Get File*\n\n' +
      'Use /file command with unique ID\n\n' +
      'Example:\n' +
      '• /file 123456789012',
      { parse_mode: 'Markdown' }
    );
  } else if (query.data === 'help') {
    await bot.sendMessage(chatId,
      '💡 *How to use this bot*\n\n' +
      '1️⃣ Upload: Send file with /upload\n' +
      '2️⃣ Get unique ID after upload\n' +
      '3️⃣ Share ID with anyone\n' +
      '4️⃣ Anyone can access file using /file <ID>',
      { parse_mode: 'Markdown' }
    );
  }
  
  await bot.answerCallbackQuery(query.id);
});

// Handle /upload command
bot.onText(/\/upload/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    let fileToUpload = null;
    
    // Check if message has file
    if (msg.document || msg.photo || msg.video || msg.audio || msg.voice) {
      fileToUpload = msg;
    }
    // Check if replying to a file
    else if (msg.reply_to_message) {
      const replied = msg.reply_to_message;
      if (replied.document || replied.photo || replied.video || replied.audio || replied.voice) {
        fileToUpload = replied;
      }
    }
    
    if (!fileToUpload) {
      return bot.sendMessage(chatId, 
        '❌ Please send a file with /upload command or reply to a file with /upload'
      );
    }
    
    // Forward file to channel
    const forwardedMsg = await bot.forwardMessage(CHANNEL_ID, chatId, fileToUpload.message_id);
    
    // Generate unique ID
    let uniqueId;
    let exists = true;
    
    while (exists) {
      uniqueId = generateUniqueId();
      exists = await File.findOne({ uniqueId });
    }
    
    // Save to database
    const fileDoc = new File({
      uniqueId: uniqueId,
      messageId: forwardedMsg.message_id,
      channelId: CHANNEL_ID,
      uploadedBy: userId
    });
    
    await fileDoc.save();
    
    // Send success message with unique ID
    await bot.sendMessage(chatId,
      '✅ *File uploaded successfully!*\n\n' +
      `📋 Unique ID: \`${uniqueId}\`\n\n` +
      '💡 Share this ID with anyone to access the file\n' +
      `📥 Use: /file ${uniqueId}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error uploading file:', error);
    await bot.sendMessage(chatId, 
      '❌ Error uploading file. Please make sure the bot is admin in the storage channel.'
    );
  }
});

// Handle /file command
bot.onText(/\/file (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const uniqueId = match[1].trim();
  
  try {
    // Find file in database
    const fileDoc = await File.findOne({ uniqueId });
    
    if (!fileDoc) {
      return bot.sendMessage(chatId, 
        '❌ File not found! Please check the ID and try again.'
      );
    }
    
    // Forward file from channel to user
    await bot.copyMessage(chatId, fileDoc.channelId, fileDoc.messageId);
    
    await bot.sendMessage(chatId, 
      `✅ File retrieved successfully!\n📋 ID: \`${uniqueId}\``,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error retrieving file:', error);
    await bot.sendMessage(chatId, 
      '❌ Error retrieving file. The file might have been deleted from the channel.'
    );
  }
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Bot is running...');
