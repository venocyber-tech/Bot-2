// Initialize Socket.io connection
const socket = io();

// DOM elements
const statusMessage = document.getElementById('statusMessage');
const qrContainer = document.getElementById('qrContainer');
const connectedContainer = document.getElementById('connectedContainer');
const qrcodeElement = document.getElementById('qrcode');

// Update status message
function updateStatus(message, type = 'waiting') {
    statusMessage.innerHTML = `
        ${type === 'waiting' ? '<div class="spinner"></div>' : ''}
        <span>${message}</span>
    `;
    statusMessage.className = `status ${type}`;
}

// Generate QR code
function generateQRCode(qrData) {
    qrcodeElement.innerHTML = '';
    QRCode.toCanvas(qrData, {
        width: 250,
        margin: 2,
        color: {
            dark: '#25D366',
            light: '#ffffff'
        }
    }, function(err, canvas) {
        if (err) {
            console.error('QR code generation error:', err);
            updateStatus('Error generating QR code', 'error');
            return;
        }
        qrcodeElement.appendChild(canvas);
    });
}

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus('Connected to server', 'waiting');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateStatus('Disconnected from server', 'error');
});

socket.on('qrCode', (data) => {
    console.log('Received QR code');
    updateStatus('Scan the QR code with WhatsApp', 'waiting');
    qrContainer.classList.remove('hidden');
    connectedContainer.classList.add('hidden');
    generateQRCode(data.qr);
});

socket.on('status', (data) => {
    console.log('Status update:', data);
    
    if (data.status === 'connected') {
        updateStatus('WhatsApp bot connected successfully!', 'connected');
        qrContainer.classList.add('hidden');
        connectedContainer.classList.remove('hidden');
    } else if (data.status === 'error') {
        updateStatus(data.message, 'error');
    } else if (data.status === 'disconnected') {
        updateStatus(data.message, 'error');
    } else if (data.status === 'waiting') {
        updateStatus(data.message, 'waiting');
    }
});

// Check initial status on page load
document.addEventListener('DOMContentLoaded', () => {
    fetch('/status')
        .then(response => response.json())
        .then(data => {
            if (data.ready) {
                updateStatus('WhatsApp bot connected successfully!', 'connected');
                connectedContainer.classList.remove('hidden');
            } else if (data.hasQR) {
                // If we already have a QR code, request it from the server
                socket.emit('getQR');
            }
        })
        .catch(error => {
            console.error('Status check error:', error);
            updateStatus('Error connecting to server', 'error');
        });
});

// Request QR code if needed
socket.emit('getQR');
