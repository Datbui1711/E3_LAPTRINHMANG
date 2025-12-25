/**
 * Dashboard Client với WebSocket API
 * Minh họa: realtime data streaming, subscription, canvas visualization
 */

// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

// Chart data storage (lưu 60 điểm gần nhất)
const chartData = {
    temperature: [],
    stock: [],
    cpu: []
};
const MAX_CHART_POINTS = 60;

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const checkboxes = {
    temperature: document.getElementById('metric-temperature'),
    stock: document.getElementById('metric-stock'),
    cpu: document.getElementById('metric-cpu')
};

/**
 * Kết nối WebSocket
 */
function connect() {
    const wsUrl = 'ws://localhost:8765/ws/dashboard';
    console.log('[WS] Connecting to:', wsUrl);
    
    updateStatus('connecting', 'Đang kết nối...');
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = (event) => {
            console.log('[WS] Connected!', event);
            updateStatus('connected', 'Đã kết nối - Đang nhận dữ liệu realtime');
            reconnectAttempts = 0;
            
            // Gửi subscription ban đầu
            sendSubscription();
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (error) {
                console.error('[WS] Failed to parse message:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('[WS] Error:', error);
            updateStatus('disconnected', 'Lỗi kết nối');
        };
        
        ws.onclose = (event) => {
            console.log('[WS] Closed:', event.code, event.reason);
            updateStatus('disconnected', 'Mất kết nối');
            
            // Auto reconnect
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
                reconnectAttempts++;
                
                console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                updateStatus('connecting', `Kết nối lại sau ${delay/1000}s...`);
                
                setTimeout(connect, delay);
            } else {
                updateStatus('disconnected', 'Không thể kết nối. Vui lòng tải lại trang.');
            }
        };
        
    } catch (error) {
        console.error('[WS] Failed to create WebSocket:', error);
        updateStatus('disconnected', 'Không thể kết nối');
    }
}

/**
 * Gửi subscription message
 */
function sendSubscription() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    const subscribedMetrics = [];
    
    Object.entries(checkboxes).forEach(([metric, checkbox]) => {
        if (checkbox.checked) {
            subscribedMetrics.push(metric);
        }
    });
    
    const message = {
        type: 'subscribe',
        metrics: subscribedMetrics
    };
    
    try {
        ws.send(JSON.stringify(message));
        console.log('[WS] Sent subscription:', message);
        
        // Update UI
        updateMetricCards();
    } catch (error) {
        console.error('[WS] Failed to send subscription:', error);
    }
}

/**
 * Xử lý message từ server
 */
function handleMessage(data) {
    switch (data.type) {
        case 'metric':
            updateMetric(data.metric, data.value, data.ts);
            break;
            
        case 'system':
            console.log('[System]', data.text);
            break;
            
        default:
            console.warn('[WS] Unknown message type:', data.type);
    }
}

/**
 * Update metric value và chart
 */
function updateMetric(metric, value, timestamp) {
    // Update value display
    const valueElement = document.getElementById(`value-${metric}`);
    if (valueElement) {
        valueElement.textContent = value.toFixed(2);
        
        // Thêm animation effect
        valueElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
            valueElement.style.transform = 'scale(1)';
        }, 200);
    }
    
    // Update time
    const timeElement = document.getElementById(`time-${metric}`);
    if (timeElement) {
        timeElement.textContent = `Cập nhật: ${formatTime(timestamp)}`;
    }
    
    // Lưu data vào chart
    if (chartData[metric]) {
        chartData[metric].push({
            value: value,
            timestamp: timestamp
        });
        
        // Giới hạn số điểm
        if (chartData[metric].length > MAX_CHART_POINTS) {
            chartData[metric].shift();
        }
        
        // Vẽ chart
        drawChart(metric);
    }
}

/**
 * Vẽ mini chart với Canvas API
 */
function drawChart(metric) {
    const canvas = document.getElementById(`chart-${metric}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const data = chartData[metric];
    
    if (data.length === 0) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Tính min/max để scale
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    
    // Chart dimensions
    const padding = 10;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    // Draw background grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }
    
    // Draw line chart
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((point, index) => {
        const x = padding + (chartWidth / (MAX_CHART_POINTS - 1)) * index;
        const normalizedValue = (point.value - minValue) / range;
        const y = padding + chartHeight - (normalizedValue * chartHeight);
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Draw area fill
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.closePath();
    ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
    ctx.fill();
    
    // Draw last point highlight
    if (data.length > 0) {
        const lastPoint = data[data.length - 1];
        const x = padding + (chartWidth / (MAX_CHART_POINTS - 1)) * (data.length - 1);
        const normalizedValue = (lastPoint.value - minValue) / range;
        const y = padding + chartHeight - (normalizedValue * chartHeight);
        
        ctx.fillStyle = '#667eea';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}

/**
 * Update metric cards visibility
 */
function updateMetricCards() {
    Object.entries(checkboxes).forEach(([metric, checkbox]) => {
        const card = document.getElementById(`card-${metric}`);
        if (card) {
            if (checkbox.checked) {
                card.classList.remove('inactive');
            } else {
                card.classList.add('inactive');
            }
        }
    });
}

/**
 * Update connection status
 */
function updateStatus(state, text) {
    statusIndicator.className = `status-indicator ${state}`;
    statusText.textContent = text;
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

// Event listeners cho checkboxes
Object.entries(checkboxes).forEach(([metric, checkbox]) => {
    checkbox.addEventListener('change', () => {
        console.log(`[UI] Checkbox ${metric} changed to:`, checkbox.checked);
        sendSubscription();
    });
});

// Start connection khi page load
connect();

console.log('[INFO] Dashboard client initialized');
console.log('[INFO] Canvas API ready for realtime charts');
