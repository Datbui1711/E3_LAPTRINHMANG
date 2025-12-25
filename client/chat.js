/**
 * Chat Client với WebSocket API
 * Minh họa: connection lifecycle, send/receive messages, reconnection
 */

// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000; // 1 giây

// DOM elements
const messagesDiv = document.getElementById('messages');
const nameInput = document.getElementById('name-input');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const onlineCount = document.getElementById('online-count');

// Load saved name từ localStorage
const savedName = localStorage.getItem('chatName');
if (savedName) {
    nameInput.value = savedName;
}

/**
 * Kết nối WebSocket
 */
function connect() {
    const wsUrl = 'ws://localhost:8765/ws/chat';
    console.log('[WS] Connecting to:', wsUrl);
    
    updateStatus('connecting', 'Đang kết nối...');
    
    try {
        // Tạo WebSocket connection
        ws = new WebSocket(wsUrl);
        
        // Event: Connection opened
        ws.onopen = (event) => {
            console.log('[WS] Connected!', event);
            updateStatus('connected', 'Đã kết nối');
            reconnectAttempts = 0;
            enableInput();
        };
        
        // Event: Message received
        ws.onmessage = (event) => {
            console.log('[WS] Message received:', event.data);
            
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (error) {
                console.error('[WS] Failed to parse message:', error);
            }
        };
        
        // Event: Error occurred
        ws.onerror = (error) => {
            console.error('[WS] Error:', error);
            updateStatus('disconnected', 'Lỗi kết nối');
        };
        
        // Event: Connection closed
        ws.onclose = (event) => {
            console.log('[WS] Closed:', event.code, event.reason);
            updateStatus('disconnected', 'Mất kết nối');
            disableInput();
            
            // Auto reconnect với exponential backoff
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
                reconnectAttempts++;
                
                console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                updateStatus('connecting', `Kết nối lại sau ${delay/1000}s...`);
                
                setTimeout(connect, delay);
            } else {
                updateStatus('disconnected', 'Không thể kết nối. Vui lòng tải lại trang.');
                addSystemMessage('⚠️ Mất kết nối với server. Vui lòng tải lại trang.');
            }
        };
        
    } catch (error) {
        console.error('[WS] Failed to create WebSocket:', error);
        updateStatus('disconnected', 'Không thể kết nối');
    }
}

/**
 * Gửi tin nhắn
 */
function sendMessage() {
    const name = nameInput.value.trim();
    const text = messageInput.value.trim();
    
    if (!name || !text) {
        return;
    }
    
    // Save name to localStorage
    localStorage.setItem('chatName', name);
    
    // Kiểm tra connection state
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage('Chưa kết nối với server!');
        return;
    }
    
    // Tạo message object
    const message = {
        type: 'chat',
        name: name,
        text: text,
        ts: Date.now()
    };
    
    try {
        // Gửi JSON qua WebSocket
        ws.send(JSON.stringify(message));
        console.log('[WS] Sent:', message);
        
        // Clear input
        messageInput.value = '';
        messageInput.focus();
        
    } catch (error) {
        console.error('[WS] Failed to send message:', error);
        addErrorMessage('Không thể gửi tin nhắn. Vui lòng thử lại.');
    }
}

/**
 * Xử lý message nhận được từ server
 */
function handleMessage(data) {
    switch (data.type) {
        case 'chat':
            addChatMessage(data);
            break;
            
        case 'system':
            addSystemMessage(data.text);
            if (data.online_count !== undefined) {
                updateOnlineCount(data.online_count);
            }
            break;
            
        case 'error':
            addErrorMessage(data.text);
            break;
            
        default:
            console.warn('[WS] Unknown message type:', data.type);
    }
}

/**
 * Thêm chat message vào UI
 */
function addChatMessage(data) {
    const messageDiv = document.createElement('div');
    const currentName = nameInput.value.trim();
    const isMe = data.name === currentName;
    
    messageDiv.className = `message user ${isMe ? 'me' : ''}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    const nameSpan = document.createElement('div');
    nameSpan.className = 'message-name';
    nameSpan.textContent = isMe ? 'Bạn' : data.name;
    
    const textSpan = document.createElement('div');
    textSpan.className = 'message-text';
    textSpan.textContent = data.text;
    
    const timeSpan = document.createElement('div');
    timeSpan.className = 'message-time';
    timeSpan.textContent = formatTime(data.ts);
    
    bubble.appendChild(nameSpan);
    bubble.appendChild(textSpan);
    bubble.appendChild(timeSpan);
    messageDiv.appendChild(bubble);
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Thêm system message
 */
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = text;
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Thêm error message
 */
function addErrorMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message error';
    messageDiv.textContent = '⚠️ ' + text;
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Update connection status
 */
function updateStatus(state, text) {
    statusIndicator.className = `status-indicator ${state}`;
    statusText.textContent = text;
}

/**
 * Update online count
 */
function updateOnlineCount(count) {
    onlineCount.textContent = `👥 ${count} người online`;
}

/**
 * Enable/disable input
 */
function enableInput() {
    nameInput.disabled = false;
    messageInput.disabled = false;
    sendButton.disabled = false;
}

function disableInput() {
    nameInput.disabled = true;
    messageInput.disabled = true;
    sendButton.disabled = true;
}

/**
 * Auto scroll to bottom
 */
function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Event listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Start connection khi page load
connect();

// Log connection states để debug
console.log('[INFO] WebSocket.CONNECTING =', WebSocket.CONNECTING); // 0
console.log('[INFO] WebSocket.OPEN =', WebSocket.OPEN); // 1
console.log('[INFO] WebSocket.CLOSING =', WebSocket.CLOSING); // 2
console.log('[INFO] WebSocket.CLOSED =', WebSocket.CLOSED); // 3
