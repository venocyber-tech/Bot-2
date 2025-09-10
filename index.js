const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store QR code and status
let qrCode = null;
let isAuthenticated = false;
let clientReady = false;

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
    res.json({
        authenticated: isAuthenticated,
        ready: clientReady,
        hasQR: !!qrCode,
        timestamp: new Date().toISOString()
    });
});

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--remote-debugging-port=9222',
            '--remote-debugging-address=0.0.0.0'
        ],
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
    }
});

// QR Code generation
client.on('qr', (qr) => {
    console.log('QR RECEIVED: Scan this QR code with your WhatsApp');
    qrcode.generate(qr, { small: true });
    
    // Store QR code for web display
    qrCode = qr;
    isAuthenticated = false;
    
    // Emit to all connected web clients
    io.emit('qrCode', { qr: qr, status: 'pending' });
});

// Client ready
client.on('ready', () => {
    console.log('✅ Client is ready and connected!');
    clientReady = true;
    isAuthenticated = true;
    qrCode = null;
    
    // Notify web clients
    io.emit('status', { 
        status: 'connected', 
        message: 'WhatsApp bot is connected and ready!',
        ready: true
    });
});

// Authentication failure handling
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
    io.emit('status', { 
        status: 'error', 
        message: 'Authentication failed. Please try again.' 
    });
});

// Disconnected handling
client.on('disconnected', (reason) => {
    console.log('❌ Client was logged out:', reason);
    clientReady = false;
    isAuthenticated = false;
    
    io.emit('status', { 
        status: 'disconnected', 
        message: 'WhatsApp connection lost. Refresh to generate a new QR code.' 
    });
});

// Message handler
client.on('message', async (message) => {
    if (message.from === 'status@broadcast') return;
    
    console.log(`📩 Message from ${message.from}: ${message.body}`);
    
    try {
        await handleIncomingMessage(message);
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// Handle incoming messages
async function handleIncomingMessage(message) {
    const command = message.body.toLowerCase().trim();
    
    const commands = {
        '!hello': `Hello! 👋 How can I assist you today?`,
        '!help': `🤖 *Available Commands:*\n\n• !hello - Greet the bot\n• !info - Bot information\n• !time - Current time\n• !help - Show this help menu\n• !status - Check bot status`,
        '!info': `*Bot Information:*\n\n• Version: 2.0.0\n• Platform: Heroku\n• Status: Active`,
        '!time': `🕒 Current time: ${new Date().toLocaleString()}`,
        '!status': `✅ Bot is online and running!`
    };
    
    if (commands[command]) {
        await message.reply(commands[command]);
        return;
    }
    
    // Keyword-based responses
    const keywordResponses = [
        { keywords: ['price', 'cost', 'how much'], response: 'Our prices start from $10. Would you like to know more about our services?' },
        { keywords: ['thank', 'thanks'], response: 'You\'re welcome! 😊 Is there anything else I can help with?' },
        { keywords: ['hi', 'hello', 'hey'], response: 'Hello! 👋 How can I help you today?' },
        { keywords: ['bye', 'goodbye'], response: 'Goodbye! 👋 Have a great day!' },
        { keywords: ['help', 'support'], response: 'I can help you with basic queries. Type !help to see all commands.' }
    ];
    
    for (const item of keywordResponses) {
        if (item.keywords.some(keyword => command.includes(keyword))) {
            await message.reply(item.response);
            return;
        }
    }
}

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('Web client connected');
    
    // Send current status to newly connected client
    if (clientReady) {
        socket.emit('status', { 
            status: 'connected', 
            message: 'WhatsApp bot is connected and ready!',
            ready: true
        });
    } else if (qrCode) {
        socket.emit('qrCode', { qr: qrCode, status: 'pending' });
    } else {
        socket.emit('status', { 
            status: 'waiting', 
            message: 'Waiting for QR code generation...' 
        });
    }
    
    socket.on('disconnect', () => {
        console.log('Web client disconnected');
    });
});

// Initialize client with error handling
async function initializeClient() {
    try {
        await client.initialize();
        console.log('🚀 WhatsApp client initialization started');
    } catch (error) {
        console.error('Failed to initialize client:', error);
        setTimeout(initializeClient, 10000);
    }
}

// Start the server
server.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    initializeClient();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    try {
        await client.destroy();
        console.log('✅ Client destroyed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});
