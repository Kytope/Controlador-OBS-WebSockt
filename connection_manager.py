from typing import List, Dict, Optional
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {
            "control": [],
            "overlay": []
        }
    
    async def connect(self, websocket: WebSocket, client_type: str):
        """Conectar un nuevo cliente"""
        await websocket.accept()
        self.active_connections[client_type].append(websocket)
        logger.info(f"Nueva conexión {client_type} - Total: {len(self.active_connections[client_type])}")
    
    def disconnect(self, websocket: WebSocket, client_type: str):
        """Desconectar un cliente"""
        if websocket in self.active_connections[client_type]:
            self.active_connections[client_type].remove(websocket)
            logger.info(f"Conexión {client_type} desconectada - Total: {len(self.active_connections[client_type])}")
    
    async def broadcast_to_overlays(self, message: dict, exclude: Optional[WebSocket] = None):
        """Enviar mensaje a todos los overlays (excluyendo opcionalmente uno)"""
        disconnected = []
        sent_count = 0
        
        for connection in self.active_connections["overlay"]:
            if exclude and connection == exclude:
                continue
                
            try:
                await connection.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.warning(f"Error enviando a overlay: {e}")
                disconnected.append(connection)
        
        # Limpiar conexiones muertas
        for conn in disconnected:
            self.disconnect(conn, "overlay")
        
        logger.debug(f"Mensaje broadcast a {sent_count} overlays: {message.get('action', 'unknown')}")
    
    async def broadcast_to_controls(self, message: dict, exclude: Optional[WebSocket] = None):
        """Enviar mensaje a todos los paneles de control (excluyendo opcionalmente uno)"""
        disconnected = []
        sent_count = 0
        
        for connection in self.active_connections["control"]:
            if exclude and connection == exclude:
                continue
                
            try:
                await connection.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.warning(f"Error enviando a control: {e}")
                disconnected.append(connection)
        
        # Limpiar conexiones muertas
        for conn in disconnected:
            self.disconnect(conn, "control")
        
        logger.debug(f"Mensaje broadcast a {sent_count} controles: {message.get('action', 'unknown')}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Enviar mensaje a un cliente específico"""
        try:
            await websocket.send_json(message)
            return True
        except Exception as e:
            logger.error(f"Error enviando mensaje personal: {e}")
            return False
    
    def get_connection_count(self):
        """Obtener cantidad de conexiones activas"""
        return {
            "control": len(self.active_connections["control"]),
            "overlay": len(self.active_connections["overlay"]),
            "total": len(self.active_connections["control"]) + len(self.active_connections["overlay"])
        }
    
    def has_overlays(self):
        """Verificar si hay overlays conectados"""
        return len(self.active_connections["overlay"]) > 0
    
    def has_controls(self):
        """Verificar si hay controles conectados"""
        return len(self.active_connections["control"]) > 0