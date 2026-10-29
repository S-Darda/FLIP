"""Real-time channel. The client opens /ws and sends {"type": "auth", "token": ...} as its
first message, so the JWT never appears in a URL or proxy log."""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import SessionLocal
from ..deps import user_from_token
from ..models import ROLE_ADMIN
from ..realtime import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_text(), timeout=10)
        token = json.loads(first).get("token", "")
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close(code=4401)
        return
    db = SessionLocal()
    try:
        user = user_from_token(db, token)
    finally:
        db.close()
    if user is None:
        await ws.send_text(json.dumps({"type": "error", "detail": "unauthorised"}))
        await ws.close(code=4401)
        return

    await manager.connect(ws, user.user_id, user.role == ROLE_ADMIN)
    await ws.send_text(json.dumps({"type": "hello", "user_id": user.user_id, "role": user.role}))
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws, user.user_id)
