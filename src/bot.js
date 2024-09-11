const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_BOT_TOKEN, WHITELISTED_USERS, OPENAI_MODELS } = require('./config');
const { generateResponse } = require('./api');
const { getConversationHistory, addToConversationHistory, clearConversationHistory, getUserModel, setUserModel } = require('./redis');

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

async function handleStart(msg) {
  console.log('Handling /start command');
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, 'Welcome! Send me a message and I\'ll generate a response using AI.', {parse_mode: 'Markdown'});
    console.log('Start message sent successfully');
  } catch (error) {
    console.error('Error sending start message:', error);
    throw error;
  }
}

async function handleNew(msg) {
  console.log('Handling /new command');
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    await clearConversationHistory(userId);
    await bot.sendMessage(chatId, 'New conversation started. Previous context has been cleared.', {parse_mode: 'Markdown'});
    console.log('New conversation message sent successfully');
  } catch (error) {
    console.error('Error handling new conversation:', error);
    throw error;
  }
}

async function handleHistory(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const history = await getConversationHistory(userId);
    const historyText = history.map(m => `${m.role}: ${m.content}`).join('\n\n');
    await bot.sendMessage(chatId, `Your conversation history:\n\n${historyText}`, {parse_mode: 'Markdown'});
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    await bot.sendMessage(chatId, 'Sorry, there was an error retrieving your conversation history.', {parse_mode: 'Markdown'});
  }
}

async function handleHelp(msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '等待补充', {parse_mode: 'Markdown'});
}

async function handleSwitchModel(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const modelName = msg.text.split(' ')[1];

  if (OPENAI_MODELS.includes(modelName)) {
    await setUserModel(userId, modelName);
    await bot.sendMessage(chatId, `Model switched to ${modelName}`, {parse_mode: 'Markdown'});
  } else {
    await bot.sendMessage(chatId, 'Invalid model name. Use /help to see available models.', {parse_mode: 'Markdown'});
  }
}

async function handleMessage(msg) {
  console.log('Handling message:', JSON.stringify(msg));
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    if (!WHITELISTED_USERS.includes(userId)) {
      console.log('User not whitelisted:', userId);
      console.log('Whitelisted users:', WHITELISTED_USERS);
      await bot.sendMessage(chatId, 'Sorry, you are not authorized to use this bot.', {parse_mode: 'Markdown'});
      return;
    }

    if (msg.text === '/new') {
      await handleNew(msg);
    } else if (msg.text === '/history') {
      await handleHistory(msg);
    } else if (msg.text === '/help') {
      await handleHelp(msg);
    } else if (msg.text.startsWith('/switchmodel')) {
      await handleSwitchModel(msg);
    } else if (msg.text && !msg.text.startsWith('/')) {
      console.log('Generating response for:', msg.text);
      
      // Send "typing" action
      await bot.sendChatAction(chatId, 'typing');
      
      // Get conversation history and user's model
      const conversationHistory = await getConversationHistory(userId);
      const userModel = await getUserModel(userId) || OPENAI_MODELS[0];
      console.log('Retrieved conversation history:', JSON.stringify(conversationHistory));
      console.log('Using model:', userModel);
      
      const response = await generateResponse(msg.text, conversationHistory, userModel);
      console.log('Generated response:', response);
      
      // Add to conversation history
      await addToConversationHistory(userId, msg.text, response);
      
      // Send the response with Markdown parsing
      await bot.sendMessage(chatId, response, {parse_mode: 'Markdown'});
      console.log('Response sent successfully');
    } else {
      console.log('Received non-text or command message');
    }
  } catch (error) {
    console.error('Error in handleMessage:', error);
    await bot.sendMessage(chatId, 'Sorry, there was an error processing your message. Please try again later.', {parse_mode: 'Markdown'})
      .catch(sendError => console.error('Error sending error message:', sendError));
  }
}

module.exports = { bot, handleMessage, handleStart };
