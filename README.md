# 📚 WebSocket Realtime Lab - Hướng dẫn đầy đủ

Dự án DEMO về **Lập trình bất đồng bộ** và **WebSocket realtime** với Python asyncio.

---

## 📖 Lý thuyết cơ bản

### 1. WebSocket Protocol

WebSocket là giao thức communication **full-duplex** (hai chiều đồng thời) qua single TCP connection.

#### WebSocket Handshake (HTTP Upgrade)

**Bước 1: Client gửi HTTP Upgrade request**
```
GET /ws/chat HTTP/1.1
Host: localhost:8765
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

**Bước 2: Server phản hồi**
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

Sau handshake, connection "nâng cấp" từ HTTP → WebSocket và giữ mở liên tục.

### 2. WebSocket Frames

Sau khi handshake thành công, data được trao đổi qua **frames**:

| Frame Type | Opcode | Mô tả |
|------------|--------|-------|
| **Text** | 0x1 | Dữ liệu text (UTF-8), ví dụ JSON |
| **Binary** | 0x2 | Dữ liệu binary (hình ảnh, file...) |
| **Close** | 0x8 | Đóng connection (kèm code + reason) |
| **Ping** | 0x9 | Keepalive check từ sender |
| **Pong** | 0xA | Response cho Ping frame |

**Ping/Pong mechanism:**
- Server (hoặc client) gửi Ping frame định kỳ
- Bên nhận phải trả lời bằng Pong frame
- Nếu không nhận Pong → connection bị coi là "dead" → đóng

### 3. Tại sao dùng Asyncio (Bất đồng bộ)?

**So sánh:**

| Đồng bộ (Synchronous) | Bất đồng bộ (Asynchronous) |
|-----------------------|---------------------------|
| Xử lý 1 request/lần | Xử lý nhiều request đồng thời |
| Blocking I/O → chờ đợi | Non-blocking I/O → không chờ |
| 1 thread/client → tốn tài nguyên | Event loop → hiệu quả cao |

**asyncio** cho phép server xử lý **hàng ngàn connections** đồng thời trên **1 thread** bằng cách:
1. Sử dụng **event loop** để quản lý tasks
2. **await** cho I/O operations (không block)
3. Tự động switch giữa các tasks khi có I/O

**Ví dụ:**
```python
# Synchronous - xử lý tuần tự
for client in clients:
    data = client.recv()  # Block ở đây cho đến khi nhận data
    process(data)

# Asynchronous - xử lý song song
async for message in websocket:  # Không block, event loop tự switch
    await process(message)  # Chỉ await khi cần I/O
```

---

## 🚀 Hướng dẫn chạy

### Bước 1: Cài đặt môi trường

#### Trên Windows:
```powershell
# Di chuyển vào thư mục server
cd server

# Tạo virtual environment
python -m venv .venv

# Kích hoạt virtual environment
.venv\Scripts\Activate.ps1

# Cài đặt dependencies
pip install -r requirements.txt
```

#### Trên Linux/macOS:
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Bước 2: Chạy WebSocket Server

```bash
python server.py
```

**Output mong đợi:**
```
============================================================
WebSocket Server - Chat & Dashboard Realtime Demo
============================================================
Server starting at ws://localhost:8765
Endpoints:
  - ws://localhost:8765/ws/chat
  - ws://localhost:8765/ws/dashboard
============================================================
[SERVER] Server is running. Press Ctrl+C to stop.
```

### Bước 3: Mở Client

Có 2 cách:

#### Cách 1: Dùng Live Server (VS Code)
1. Cài extension "Live Server" trong VS Code
2. Right-click vào `client/chat.html` → "Open with Live Server"
3. Right-click vào `client/dashboard.html` → "Open with Live Server"

#### Cách 2: Mở trực tiếp file
1. Mở `client/chat.html` trong browser (Ctrl+O)
2. Mở `client/dashboard.html` trong tab mới

> ⚠️ **Lưu ý:** File HTML có thể mở trực tiếp vì WebSocket không bị CORS restriction.

---

## 🧪 Kiểm thử chức năng

### Test 1: Chat Broadcast
1. Mở 2-3 tab browser với `chat.html`
2. Nhập tên khác nhau ở mỗi tab
3. Gửi message từ 1 tab
4. **Kết quả mong đợi:** Message hiển thị realtime ở tất cả tabs

**Quan sát console server:**
```
[CHAT] Client 123456 connected from ('127.0.0.1', 54321)
[CHAT] Alice: Hello everyone...
```

### Test 2: Dashboard Realtime Streaming
1. Mở `dashboard.html`
2. Quan sát dữ liệu cập nhật mỗi giây
3. Tick/untick checkbox metrics
4. **Kết quả mong đợi:** 
   - Chart vẽ realtime
   - Chỉ metrics được tick mới nhận data

### Test 3: Reconnection
1. Đang mở chat/dashboard
2. Stop server (Ctrl+C)
3. **Kết quả mong đợi:** Client hiển thị "Mất kết nối", tự động thử reconnect
4. Start lại server
5. **Kết quả mong đợi:** Client tự kết nối lại

### Test 4: Rate Limiting & Validation
1. Trong chat, gửi nhiều message liên tục (spam)
2. **Kết quả mong đợi:** Server từ chối với error "Bạn đang gửi tin nhắn quá nhanh"
3. Thử gửi message rỗng
4. **Kết quả mong đợi:** Error "Tên và nội dung không được để trống"

---

## 📁 Cấu trúc dự án

```
ws_realtime_lab/
├── server/
│   ├── server.py           # WebSocket server (asyncio + websockets)
│   ├── requirements.txt    # Python dependencies
│   └── README.md          # File này
│
└── client/
    ├── chat.html          # Chat UI
    ├── dashboard.html     # Dashboard UI
    ├── styles.css         # Shared styles
    ├── chat.js           # Chat WebSocket client
    └── dashboard.js      # Dashboard WebSocket client
```

---

## 🔍 Chi tiết implementation

### Server (server.py)

**Key features:**
- ✅ 2 endpoints: `/ws/chat` và `/ws/dashboard`
- ✅ Async connection management với `Set` và `Dict`
- ✅ Broadcast messages đến multiple clients
- ✅ Rate limiting (1 message/giây)
- ✅ Input validation (length, empty check)
- ✅ Graceful shutdown & cleanup
- ✅ Ping/Pong keepalive (ping_interval=20s)
- ✅ Background task cho data streaming (dashboard)

**Thư viện:**
- `websockets>=12.0`: Thư viện WebSocket hiện đại (không DeprecationWarning)
- `asyncio`: Built-in Python async framework

### Client (JavaScript)

**WebSocket API sử dụng:**

```javascript
// Tạo connection
const ws = new WebSocket('ws://localhost:8765/ws/chat');

// Event handlers
ws.onopen = (event) => { /* Connection opened */ };
ws.onmessage = (event) => { /* Message received */ };
ws.onerror = (error) => { /* Error occurred */ };
ws.onclose = (event) => { /* Connection closed */ };

// Gửi data (phải là string hoặc binary)
ws.send(JSON.stringify({ type: 'chat', text: 'Hello' }));

// Check connection state
ws.readyState // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
```

**Reconnection strategy:**
- Exponential backoff: 1s → 2s → 4s → 8s → 16s
- Max 5 attempts, sau đó yêu cầu reload page

**Canvas Chart:**
- Vẽ realtime chart bằng Canvas 2D API
- Lưu 60 điểm gần nhất
- Auto scale theo min/max values
- Line chart + area fill + grid

---

## 🛠️ Troubleshooting

### Lỗi: "Connection refused"
- ✅ Kiểm tra server đã chạy chưa
- ✅ Kiểm tra port 8765 có bị chiếm không: `netstat -an | findstr 8765`

### Lỗi: "WebSocket connection failed"
- ✅ Kiểm tra URL: `ws://localhost:8765/ws/chat` (không phải `wss://` hoặc `http://`)
- ✅ Mở Developer Tools → Network → WS để xem chi tiết

### Chart không hiển thị
- ✅ Kiểm tra canvas element có tồn tại không
- ✅ Mở Console xem có lỗi JS không

### Không nhận được message
- ✅ Kiểm tra JSON format đúng chưa
- ✅ Xem server logs để debug

---
