"""
WebSocket Server Demo - Chat và Dashboard Realtime
Minh họa lập trình bất đồng bộ với asyncio + websockets
"""

import asyncio
import json
import logging
import time
import random
from datetime import datetime
from typing import Set, Dict, List
from websockets.asyncio.server import serve, ServerConnection

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Quản lý client connections theo room
chat_clients: Set[ServerConnection] = set()
dashboard_clients: Dict[ServerConnection, List[str]] = {}  # {connection: [subscribed_metrics]}

# Rate limiting cho chat (đơn giản: lưu timestamp của mỗi client)
chat_rate_limit: Dict[ServerConnection, List[float]] = {}
RATE_LIMIT_SECONDS = 1.0  # Tối đa 1 tin nhắn/giây
MAX_MESSAGE_LENGTH = 500
MAX_NAME_LENGTH = 50


async def handle_chat(websocket: ServerConnection):
    """Xử lý WebSocket connection cho /ws/chat"""
    client_id = id(websocket)
    logger.info(f"[CHAT] Client {client_id} connected from {websocket.remote_address}")
    
    # Thêm client vào room
    chat_clients.add(websocket)
    chat_rate_limit[websocket] = []
    
    try:
        # Gửi thông báo user joined cho tất cả client khác
        join_message = {
            "type": "system",
            "text": "Một người dùng mới đã tham gia chat",
            "ts": int(time.time() * 1000),
            "online_count": len(chat_clients)
        }
        await broadcast_chat(join_message, exclude=websocket)
        
        # Gửi welcome message cho client mới
        welcome_message = {
            "type": "system",
            "text": f"Chào mừng đến chat room! Hiện có {len(chat_clients)} người online.",
            "ts": int(time.time() * 1000),
            "online_count": len(chat_clients)
        }
        await websocket.send(json.dumps(welcome_message))
        
        # Xử lý messages từ client
        async for message in websocket:
            try:
                data = json.loads(message)
                
                # Validate message type
                if data.get("type") != "chat":
                    await websocket.send(json.dumps({
                        "type": "error",
                        "text": "Invalid message type",
                        "ts": int(time.time() * 1000)
                    }))
                    continue
                
                # Validate và sanitize input
                name = data.get("name", "").strip()
                text = data.get("text", "").strip()
                
                if not name or not text:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "text": "Tên và nội dung không được để trống",
                        "ts": int(time.time() * 1000)
                    }))
                    continue
                
                if len(name) > MAX_NAME_LENGTH:
                    name = name[:MAX_NAME_LENGTH]
                
                if len(text) > MAX_MESSAGE_LENGTH:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "text": f"Tin nhắn quá dài (tối đa {MAX_MESSAGE_LENGTH} ký tự)",
                        "ts": int(time.time() * 1000)
                    }))
                    continue
                
                # Rate limiting
                current_time = time.time()
                chat_rate_limit[websocket] = [
                    t for t in chat_rate_limit[websocket] 
                    if current_time - t < RATE_LIMIT_SECONDS
                ]
                
                if len(chat_rate_limit[websocket]) >= 1:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "text": "Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi 1 giây.",
                        "ts": int(time.time() * 1000)
                    }))
                    continue
                
                chat_rate_limit[websocket].append(current_time)
                
                # Broadcast message đến tất cả clients
                chat_message = {
                    "type": "chat",
                    "name": name,
                    "text": text,
                    "ts": int(time.time() * 1000)
                }
                await broadcast_chat(chat_message)
                logger.info(f"[CHAT] {name}: {text[:50]}...")
                
            except json.JSONDecodeError:
                logger.warning(f"[CHAT] Invalid JSON from client {client_id}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "text": "Invalid JSON format",
                    "ts": int(time.time() * 1000)
                }))
            except Exception as e:
                logger.error(f"[CHAT] Error processing message: {e}")
    
    except Exception as e:
        logger.error(f"[CHAT] Connection error for client {client_id}: {e}")
    
    finally:
        # Cleanup khi disconnect
        chat_clients.discard(websocket)
        if websocket in chat_rate_limit:
            del chat_rate_limit[websocket]
        
        # Thông báo user left
        leave_message = {
            "type": "system",
            "text": "Một người dùng đã rời khỏi chat",
            "ts": int(time.time() * 1000),
            "online_count": len(chat_clients)
        }
        await broadcast_chat(leave_message)
        logger.info(f"[CHAT] Client {client_id} disconnected. Remaining: {len(chat_clients)}")


async def broadcast_chat(message: dict, exclude: ServerConnection = None):
    """Broadcast message đến tất cả chat clients"""
    if not chat_clients:
        return
    
    message_str = json.dumps(message)
    tasks = []
    
    for client in chat_clients.copy():
        if client != exclude:
            try:
                tasks.append(client.send(message_str))
            except Exception:
                pass
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def handle_dashboard(websocket: ServerConnection):
    """Xử lý WebSocket connection cho /ws/dashboard"""
    client_id = id(websocket)
    logger.info(f"[DASHBOARD] Client {client_id} connected from {websocket.remote_address}")
    
    # Mặc định subscribe tất cả metrics
    dashboard_clients[websocket] = ["temperature", "stock", "cpu"]
    
    try:
        # Gửi welcome message
        welcome_message = {
            "type": "system",
            "text": "Kết nối dashboard thành công. Đang nhận dữ liệu realtime...",
            "ts": int(time.time() * 1000),
            "subscribed": dashboard_clients[websocket]
        }
        await websocket.send(json.dumps(welcome_message))
        
        # Xử lý messages từ client (subscribe/unsubscribe)
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data.get("type") == "subscribe":
                    metrics = data.get("metrics", [])
                    valid_metrics = ["temperature", "stock", "cpu"]
                    
                    # Validate metrics
                    subscribed = [m for m in metrics if m in valid_metrics]
                    dashboard_clients[websocket] = subscribed if subscribed else valid_metrics
                    
                    logger.info(f"[DASHBOARD] Client {client_id} subscribed to: {dashboard_clients[websocket]}")
                    
                    # Gửi confirmation
                    confirm_message = {
                        "type": "system",
                        "text": f"Đã subscribe: {', '.join(dashboard_clients[websocket])}",
                        "ts": int(time.time() * 1000),
                        "subscribed": dashboard_clients[websocket]
                    }
                    await websocket.send(json.dumps(confirm_message))
                    
            except json.JSONDecodeError:
                logger.warning(f"[DASHBOARD] Invalid JSON from client {client_id}")
            except Exception as e:
                logger.error(f"[DASHBOARD] Error processing message: {e}")
    
    except Exception as e:
        logger.error(f"[DASHBOARD] Connection error for client {client_id}: {e}")
    
    finally:
        # Cleanup khi disconnect
        if websocket in dashboard_clients:
            del dashboard_clients[websocket]
        logger.info(f"[DASHBOARD] Client {client_id} disconnected. Remaining: {len(dashboard_clients)}")


async def dashboard_data_producer():
    """Background task: tạo và broadcast dữ liệu giả lập mỗi giây"""
    logger.info("[DASHBOARD] Data producer started")
    
    # Khởi tạo giá trị ban đầu
    metrics_data = {
        "temperature": 25.0,
        "stock": 100.0,
        "cpu": 30.0
    }
    
    while True:
        try:
            await asyncio.sleep(1)
            
            if not dashboard_clients:
                continue
            
            # Tạo dữ liệu giả lập với biến động ngẫu nhiên
            current_time = int(time.time() * 1000)
            
            # Temperature: 20-35°C
            metrics_data["temperature"] += random.uniform(-1.5, 1.5)
            metrics_data["temperature"] = max(20, min(35, metrics_data["temperature"]))
            
            # Stock price: biến động ±5%
            metrics_data["stock"] *= random.uniform(0.98, 1.02)
            metrics_data["stock"] = max(50, min(200, metrics_data["stock"]))
            
            # CPU usage: 10-90%
            metrics_data["cpu"] += random.uniform(-10, 10)
            metrics_data["cpu"] = max(10, min(90, metrics_data["cpu"]))
            
            # Broadcast từng metric đến clients đã subscribe
            for client, subscribed in list(dashboard_clients.items()):
                try:
                    for metric_name in subscribed:
                        metric_message = {
                            "type": "metric",
                            "metric": metric_name,
                            "value": round(metrics_data[metric_name], 2),
                            "ts": current_time
                        }
                        await client.send(json.dumps(metric_message))
                except Exception as e:
                    logger.error(f"[DASHBOARD] Error sending to client: {e}")
                    
        except asyncio.CancelledError:
            logger.info("[DASHBOARD] Data producer stopped")
            break
        except Exception as e:
            logger.error(f"[DASHBOARD] Error in data producer: {e}")


async def ws_handler(websocket: ServerConnection):
    """Main WebSocket handler - route theo path"""
    path = websocket.request.path if websocket.request else "/"
    logger.info(f"[SERVER] New connection to {path}")
    
    try:
        if path == "/ws/chat":
            await handle_chat(websocket)
        elif path == "/ws/dashboard":
            await handle_dashboard(websocket)
        else:
            logger.warning(f"[SERVER] Unknown path: {path}")
            await websocket.close(1002, "Unknown endpoint")
    except Exception as e:
        logger.error(f"[SERVER] Handler error: {e}")


async def main():
    """Main server function"""
    logger.info("=" * 60)
    logger.info("WebSocket Server - Chat & Dashboard Realtime Demo")
    logger.info("=" * 60)
    logger.info("Server starting at ws://localhost:8765")
    logger.info("Endpoints:")
    logger.info("  - ws://localhost:8765/ws/chat")
    logger.info("  - ws://localhost:8765/ws/dashboard")
    logger.info("=" * 60)
    
    # Start dashboard data producer task
    producer_task = asyncio.create_task(dashboard_data_producer())
    
    try:
        # Start WebSocket server với ping/pong keepalive
        async with serve(
            ws_handler,
            "localhost",
            8765,
            ping_interval=20,  # Ping mỗi 20 giây
            ping_timeout=10    # Timeout 10 giây
        ):
            logger.info("[SERVER] Server is running. Press Ctrl+C to stop.")
            # Keep running forever
            await asyncio.Future()
    except KeyboardInterrupt:
        logger.info("[SERVER] Shutting down gracefully...")
    finally:
        producer_task.cancel()
        try:
            await producer_task
        except asyncio.CancelledError:
            pass
        logger.info("[SERVER] Server stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
