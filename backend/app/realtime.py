"""WebSocket fan-out. Events go to specific users and/or every connected admin.

`publish` may be called from the event loop (training runner) or from a worker thread
(sync route handlers), so it hands the send over to the loop thread-safely.
"""
import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self._admins: set[int] = set()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    async def connect(self, ws: WebSocket, user_id: int, is_admin: bool) -> None:
        self._sockets[user_id].add(ws)
        if is_admin:
            self._admins.add(user_id)

    def disconnect(self, ws: WebSocket, user_id: int) -> None:
        conns = self._sockets.get(user_id)
        if conns:
            conns.discard(ws)
            if not conns:
                self._sockets.pop(user_id, None)
                self._admins.discard(user_id)

    def online_count(self) -> int:
        return len(self._sockets)

    async def _send(self, event: dict, user_ids: set[int], admins: bool) -> None:
        targets = set(user_ids)
        if admins:
            targets |= self._admins
        text = json.dumps(event, default=str)
        for uid in targets:
            for ws in list(self._sockets.get(uid, ())):
                try:
                    await ws.send_text(text)
                except Exception:
                    self.disconnect(ws, uid)

    def publish(self, event: dict, users=(), admins: bool = False) -> None:
        if self.loop is None or self.loop.is_closed():
            return
        users = {u for u in users if u is not None}
        coro = self._send(event, users, admins)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(coro)
        else:
            asyncio.run_coroutine_threadsafe(coro, self.loop)


manager = ConnectionManager()
