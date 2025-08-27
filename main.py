# main.py - VERSIÓN MEJORADA CON ESTADO VERSIONADO
import os
import logging
import uuid
import time
from pathlib import Path
from fastapi import FastAPI, WebSocket, Request, UploadFile, File, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from models.media import MediaItem, MediaState, OperationRequest, OperationResponse
from connection_manager import ConnectionManager
import json
import asyncio
from typing import Dict, Optional

# ==========================================
# CONFIGURACIÓN PARA RAILWAY
# ==========================================

class Config:
    PORT = int(os.getenv("PORT", 8000))
    HOST = "0.0.0.0"
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 50 * 1024 * 1024))
    MAX_CONNECTIONS = int(os.getenv("MAX_CONNECTIONS", 50))
    MEDIA_PATH = Path(os.getenv("MEDIA_PATH", "./static/media"))
    TEMPLATES_PATH = Path("./templates")
    STATIC_PATH = Path("./static")
    RAILWAY_ENV = os.getenv("RAILWAY_ENVIRONMENT_NAME", "development")
    RAILWAY_PROJECT = os.getenv("RAILWAY_PROJECT_NAME", "obs-control")

config = Config()

# ==========================================
# LOGGING CONFIGURACIÓN
# ==========================================

logging.basicConfig(
    level=logging.INFO if not config.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger(__name__)

# ==========================================
# INICIALIZAR APLICACIÓN
# ==========================================

app = FastAPI(
    title="OBS Media Control",
    description="Control de medios en tiempo real para OBS con estado versionado",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Crear directorios necesarios
config.MEDIA_PATH.mkdir(parents=True, exist_ok=True)

# Configurar templates y archivos estáticos
templates = Jinja2Templates(directory=str(config.TEMPLATES_PATH))
app.mount("/static", StaticFiles(directory=str(config.STATIC_PATH)), name="static")

# Estado global mejorado
media_state = MediaState()
manager = ConnectionManager()

# Cola de operaciones pendientes para confirmación
pending_operations: Dict[str, OperationRequest] = {}

# ==========================================
# FUNCIONES DE UTILIDAD
# ==========================================

async def validate_media_state():
    """Validar y limpiar elementos inválidos del estado"""
    invalid_items = []
    
    for media_id, item in media_state.items.items():
        file_path = Path(f".{item.url}")
        if not file_path.exists():
            invalid_items.append(media_id)
            logger.warning(f"⚠️ Archivo no encontrado para media {media_id}: {item.url}")
    
    for media_id in invalid_items:
        media_state.remove_item(media_id)
        logger.info(f"🗑️ Elemento inválido eliminado: {media_id}")
    
    return len(invalid_items)

async def send_operation_response(websocket: WebSocket, operation: OperationRequest, success: bool, error: Optional[str] = None, data: Optional[dict] = None):
    """Enviar respuesta de confirmación para una operación"""
    response = OperationResponse(
        request_id=operation.request_id,
        success=success,
        action=operation.action,
        version=media_state.version,
        checksum=media_state.checksum or media_state.calculate_checksum(),
        error=error,
        data=data
    )
    
    await websocket.send_json({
        "action": "operation_response",
        "response": response.model_dump()
    })

# ==========================================
# WEBSOCKET ENDPOINTS MEJORADOS
# ==========================================

@app.websocket("/ws/control")
async def websocket_control(websocket: WebSocket):
    await manager.connect(websocket, "control")
    client_ip = websocket.client.host if websocket.client else "unknown"
    logger.info(f"🔌 Control conectado desde {client_ip}")
    
    try:
        # Enviar estado inicial con versión - USAR model_dump con mode='json'
        state_dict = media_state.model_dump(mode='json')  # IMPORTANTE: mode='json' serializa datetime
        
        await websocket.send_json({
            "action": "sync_state",
            "state": state_dict,
            "version": media_state.version,
            "checksum": media_state.checksum or media_state.calculate_checksum()
        })
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Crear operación si tiene request_id
            operation = None
            if "request_id" in message:
                operation = OperationRequest(
                    request_id=message["request_id"],
                    action=message["action"],
                    data=message
                )
                pending_operations[operation.request_id] = operation
            
            try:
                if message["action"] == "add_media":
                    media = message["media"]
                    media_id = media.get("id", str(uuid.uuid4()))
                    
                    media_item = MediaItem(
                        id=media_id,
                        type=media.get("type", "image"),
                        filename=media.get("filename", ""),
                        url=media.get("url", ""),
                        position=media.get("position", {"x": 100, "y": 100}),
                        size=media.get("size", {"width": 200, "height": 200}),
                        opacity=media.get("opacity", 1.0),
                        volume=media.get("volume", 1.0),
                        visible=True,
                        z_index=media.get("z_index", len(media_state.items)),
                        # Propiedades de texto
                        text_content=media.get("text_content"),
                        font_family=media.get("font_family", "Arial"),
                        font_size=media.get("font_size", 48),
                        font_weight=media.get("font_weight", "normal"),
                        font_style=media.get("font_style", "normal"),
                        text_align=media.get("text_align", "left"),
                        text_color=media.get("text_color", "#ffffff"),
                        text_shadow=media.get("text_shadow", False),
                        text_shadow_color=media.get("text_shadow_color", "#000000"),
                        text_shadow_blur=media.get("text_shadow_blur", 2),
                        text_shadow_offset=media.get("text_shadow_offset", {"x": 1, "y": 1}),
                        background_color=media.get("background_color"),
                        padding=media.get("padding", {"top": 10, "right": 10, "bottom": 10, "left": 10})
                    )
                    
                    # Actualizar estado con versionado
                    media_state.add_item(media_item)
                    media_dict = media_item.model_dump(mode='json')
                    
                    # Enviar a overlays
                    await manager.broadcast_to_overlays({
                        "action": "add_media",
                        "media": media_dict,
                        "version": media_state.version,
                        "checksum": media_state.checksum
                    })
                    
                    # Confirmar operación
                    if operation:
                        await send_operation_response(websocket, operation, True, data={"media": media_dict})
                    
                    logger.info(f"➕ Media agregada v{media_state.version}: {media.get('filename', 'unknown')}")
                
                elif message["action"] == "remove_media":
                    media_id = message["media_id"]
                    removed = media_state.remove_item(media_id)
                    
                    if removed:
                        await manager.broadcast_to_overlays({
                            "action": "remove_media",
                            "media_id": media_id,
                            "version": media_state.version,
                            "checksum": media_state.checksum
                        })
                        
                        if operation:
                            await send_operation_response(websocket, operation, True)
                        
                        logger.info(f"➖ Media eliminada v{media_state.version}: {removed.filename}")
                    else:
                        if operation:
                            await send_operation_response(websocket, operation, False, error="Media no encontrada")
                
                elif message["action"] == "update_property":
                    media_id = message["media_id"]
                    property_name = message["property"]
                    value = message["value"]
                    
                    if media_id in media_state.items:
                        media_state.update_item(media_id, {property_name: value})
                        
                        await manager.broadcast_to_overlays({
                            "action": "update_property",
                            "media_id": media_id,
                            "property": property_name,
                            "value": value,
                            "version": media_state.version,
                            "checksum": media_state.checksum
                        })
                        
                        if operation:
                            await send_operation_response(websocket, operation, True)
                        
                        logger.info(f"🔧 Propiedad actualizada v{media_state.version}: {media_id}.{property_name}")
                    else:
                        if operation:
                            await send_operation_response(websocket, operation, False, error="Media no encontrada")
                
                elif message["action"] == "clear_all":
                    cleared_count = len(media_state.items)
                    media_state.clear()
                    
                    await manager.broadcast_to_overlays({
                        "action": "clear_all",
                        "version": media_state.version,
                        "checksum": media_state.checksum
                    })
                    
                    if operation:
                        await send_operation_response(websocket, operation, True, data={"cleared_count": cleared_count})
                    
                    logger.info(f"🧹 Overlay limpiado v{media_state.version}: {cleared_count} elementos")
                
                elif message["action"] == "verify_version":
                    client_version = message.get("client_version", 0)
                    client_checksum = message.get("client_checksum", "")
                    
                    current_checksum = media_state.checksum or media_state.calculate_checksum()
                    needs_sync = (client_version != media_state.version or 
                                client_checksum != current_checksum)
                    
                    await websocket.send_json({
                        "action": "version_check",
                        "needs_sync": needs_sync,
                        "server_version": media_state.version,
                        "server_checksum": current_checksum
                    })
                    
                    if needs_sync:
                        state_dict = media_state.model_dump(mode='json')  # IMPORTANTE: mode='json'
                        await websocket.send_json({
                            "action": "sync_state",
                            "state": state_dict,
                            "version": media_state.version,
                            "checksum": current_checksum
                        })
                
                elif message["action"] == "request_sync":
                    current_checksum = media_state.checksum or media_state.calculate_checksum()
                    await websocket.send_json({
                        "action": "sync_state",
                        "state": media_state.model_dump(),
                        "version": media_state.version,
                        "checksum": current_checksum
                    })
                    
            except Exception as e:
                logger.error(f"❌ Error procesando mensaje: {e}")
                if operation:
                    await send_operation_response(websocket, operation, False, error=str(e))
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, "control")
        logger.info(f"🔌 Control desconectado desde {client_ip}")

@app.websocket("/ws/overlay")
async def websocket_overlay(websocket: WebSocket):
    await manager.connect(websocket, "overlay")
    client_ip = websocket.client.host if websocket.client else "unknown"
    logger.info(f"🎬 Overlay conectado desde {client_ip}")
    
    try:
        # Enviar estado inicial con versión - USAR model_dump con mode='json' para serializar datetime
        current_checksum = media_state.checksum or media_state.calculate_checksum()
        state_dict = media_state.model_dump(mode='json')  # IMPORTANTE: mode='json' serializa datetime
        
        await websocket.send_json({
            "action": "sync_state",
            "state": state_dict,
            "version": media_state.version,
            "checksum": current_checksum
        })
        
        logger.info(f"🔄 Estado inicial enviado a overlay: v{media_state.version} checksum:{current_checksum}")
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Crear operación si tiene request_id
            operation = None
            if "request_id" in message:
                operation = OperationRequest(
                    request_id=message["request_id"],
                    action=message["action"],
                    data=message
                )
            
            try:
                if message["action"] == "request_sync":
                    current_checksum = media_state.checksum or media_state.calculate_checksum()
                    state_dict = media_state.model_dump(mode='json')  # IMPORTANTE: mode='json'
                    
                    await websocket.send_json({
                        "action": "sync_state",
                        "state": state_dict,
                        "version": media_state.version,
                        "checksum": current_checksum
                    })
                    
                    logger.info(f"🔄 Estado sincronizado enviado a overlay: v{media_state.version}")
                
                elif message["action"] == "verify_version":
                    client_version = message.get("client_version", 0)
                    client_checksum = message.get("client_checksum", "")
                    
                    current_checksum = media_state.checksum or media_state.calculate_checksum()
                    needs_sync = (client_version != media_state.version or 
                                client_checksum != current_checksum)
                    
                    await websocket.send_json({
                        "action": "version_check",
                        "needs_sync": needs_sync,
                        "server_version": media_state.version,
                        "server_checksum": current_checksum
                    })
                    
                    if needs_sync:
                        logger.info(f"⚠️ Overlay desincronizado: cliente v{client_version} vs servidor v{media_state.version}")
                        state_dict = media_state.model_dump(mode='json')  # IMPORTANTE: mode='json'
                        
                        await websocket.send_json({
                            "action": "sync_state",
                            "state": state_dict,
                            "version": media_state.version,
                            "checksum": current_checksum
                        })
                
                elif message["action"] == "add_media":
                    media = message["media"]
                    media_id = media.get("id", str(uuid.uuid4()))
                    
                    media_item = MediaItem(
                        id=media_id,
                        type=media.get("type", "image"),
                        filename=media.get("filename", ""),
                        url=media.get("url", ""),
                        position=media.get("position", {"x": 100, "y": 100}),
                        size=media.get("size", {"width": 200, "height": 200}),
                        opacity=media.get("opacity", 1.0),
                        volume=media.get("volume", 1.0),
                        visible=True,
                        z_index=media.get("z_index", len(media_state.items)),
                        # Propiedades de texto
                        text_content=media.get("text_content"),
                        font_family=media.get("font_family", "Arial"),
                        font_size=media.get("font_size", 48),
                        font_weight=media.get("font_weight", "normal"),
                        font_style=media.get("font_style", "normal"),
                        text_align=media.get("text_align", "left"),
                        text_color=media.get("text_color", "#ffffff"),
                        text_shadow=media.get("text_shadow", False),
                        text_shadow_color=media.get("text_shadow_color", "#000000"),
                        text_shadow_blur=media.get("text_shadow_blur", 2),
                        text_shadow_offset=media.get("text_shadow_offset", {"x": 1, "y": 1}),
                        background_color=media.get("background_color"),
                        padding=media.get("padding", {"top": 10, "right": 10, "bottom": 10, "left": 10})
                    )
                    
                    media_state.add_item(media_item)
                    media_dict = media_item.model_dump(mode='json')
                    
                    # Notificar a TODOS los overlays
                    await manager.broadcast_to_overlays({
                        "action": "add_media",
                        "media": media_dict,
                        "version": media_state.version,
                        "checksum": media_state.checksum
                    })
                    
                    await manager.broadcast_to_controls({
                        "action": "media_added",
                        "media": media_dict,
                        "version": media_state.version
                    })
                    
                    # <<<--- AÑADIR ESTA LÍNEA ---<<<
                    if operation:
                        await send_operation_response(websocket, operation, True, data={"media": media_dict})
                    
                    logger.info(f"➕ Media agregada desde overlay v{media_state.version}: {media.get('filename', 'unknown')}")
                
                elif message["action"] == "remove_media":
                    media_id = message["media_id"]
                    removed = media_state.remove_item(media_id)
                    
                    if removed:
                        # Notificar a TODOS los overlays (sin exclude)
                        await manager.broadcast_to_overlays({
                            "action": "remove_media",
                            "media_id": media_id,
                            "version": media_state.version,
                            "checksum": media_state.checksum
                        })
                        
                        await manager.broadcast_to_controls({
                            "action": "media_removed",
                            "media_id": media_id,
                            "version": media_state.version
                        })
                        
                        # <<<--- ESTA PARTE YA ESTABA CORRECTA ---<<<
                        if operation:
                            await send_operation_response(websocket, operation, True)
                        
                        logger.info(f"➖ Media eliminada desde overlay v{media_state.version}: {removed.filename}")
                    else:
                        if operation:
                            await send_operation_response(websocket, operation, False, error="Media no encontrada")
                        logger.warning(f"⚠️ Intento de eliminar media inexistente desde overlay: {media_id}")
                
                elif message["action"] == "update_property":
                    media_id = message["media_id"]
                    property_name = message["property"]
                    value = message["value"]
                    
                    if media_id in media_state.items:
                        media_state.update_item(media_id, {property_name: value})
                        
                        await manager.broadcast_to_overlays({
                            "action": "update_property",
                            "media_id": media_id,
                            "property": property_name,
                            "value": value,
                            "version": media_state.version,
                            "checksum": media_state.checksum
                        }, exclude=websocket) # exclude=websocket es correcto aquí
                        
                        await manager.broadcast_to_controls({
                            "action": "property_updated",
                            "media_id": media_id,
                            "property": property_name,
                            "value": value,
                            "version": media_state.version
                        })
                        
                        # <<<--- AÑADIR ESTA LÍNEA ---<<<
                        if operation:
                            await send_operation_response(websocket, operation, True)
                        
                        logger.info(f"🔧 Propiedad actualizada desde overlay v{media_state.version}: {media_id}.{property_name}")
                    else:
                        if operation:
                            await send_operation_response(websocket, operation, False, error="Media no encontrada")
                
                elif message["action"] == "clear_all":
                    cleared_count = len(media_state.items)
                    media_state.clear()
                    
                    # Notificar a TODOS (sin exclude)
                    await manager.broadcast_to_overlays({
                        "action": "clear_all",
                        "version": media_state.version,
                        "checksum": media_state.checksum
                    })
                    
                    await manager.broadcast_to_controls({
                        "action": "overlay_cleared",
                        "version": media_state.version
                    })
                    
                    if operation:
                        await send_operation_response(websocket, operation, True, data={"cleared_count": cleared_count})
                    
                    logger.info(f"🧹 Overlay limpiado desde overlay v{media_state.version}: {cleared_count} elementos")
                    
            except Exception as e:
                logger.error(f"❌ Error procesando mensaje del overlay: {e}")
                if operation:
                    await send_operation_response(websocket, operation, False, error=str(e))
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, "overlay")
        logger.info(f"🎬 Overlay desconectado desde {client_ip}")
    except Exception as e:
        logger.error(f"❌ Error en WebSocket overlay: {e}")
        manager.disconnect(websocket, "overlay")

# ==========================================
# RUTAS PRINCIPALES
# ==========================================

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/control", response_class=HTMLResponse)
async def control_panel(request: Request):
    return templates.TemplateResponse("control.html", {"request": request})

@app.get("/overlay", response_class=HTMLResponse)
async def obs_overlay(request: Request):
    return templates.TemplateResponse("overlay.html", {"request": request})

@app.get("/obs-output", response_class=HTMLResponse)
async def obs_output(request: Request):
    return templates.TemplateResponse("obs-output.html", {"request": request})

# ==========================================
# API ENDPOINTS
# ==========================================

@app.get("/health")
async def health_check():
    """Health check endpoint mejorado"""
    current_checksum = media_state.checksum or media_state.calculate_checksum()
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "environment": config.RAILWAY_ENV,
        "connections": manager.get_connection_count(),
        "media_count": len(media_state.items),
        "state_version": media_state.version,
        "state_checksum": current_checksum
    }

@app.get("/api/state/version")
async def get_state_version():
    """Obtener versión actual del estado"""
    current_checksum = media_state.checksum or media_state.calculate_checksum()
    return {
        "version": media_state.version,
        "checksum": current_checksum,
        "item_count": len(media_state.items),
        "last_modified": media_state.last_modified
    }

@app.get("/api/media")
async def get_all_media():
    """Obtener todos los items de media disponibles en la biblioteca"""
    items = []
    
    try:
        if config.MEDIA_PATH.exists():
            for file_path in config.MEDIA_PATH.iterdir():
                if file_path.is_file() and file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm', '.ogg']:
                    media_id = str(uuid.uuid4())
                    media_type = "video" if file_path.suffix.lower() in ['.mp4', '.webm', '.ogg'] else "image"
                    
                    media_item = MediaItem(
                        id=media_id,
                        type=media_type,
                        filename=file_path.name,
                        url=f"/static/media/{file_path.name}"
                    )
                    items.append(media_item.model_dump())
        
        return {"items": items}
    
    except Exception as e:
        logger.error(f"❌ Error al obtener biblioteca de medios: {e}")
        return {"items": []}

@app.get("/api/media/scan")
async def scan_media_folder():
    """Escanear carpeta de media y retornar archivos disponibles"""
    items = []
    
    try:
        if not config.MEDIA_PATH.exists():
            return {"scanned": 0, "items": []}
        
        for file_path in config.MEDIA_PATH.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm', '.ogg']:
                media_id = str(uuid.uuid4())
                media_type = "video" if file_path.suffix.lower() in ['.mp4', '.webm', '.ogg'] else "image"
                
                media_item = MediaItem(
                    id=media_id,
                    type=media_type,
                    filename=file_path.name,
                    url=f"/static/media/{file_path.name}"
                )
                
                items.append(media_item)
        
        logger.info(f"🔍 Escaneados {len(items)} archivos")
        return {"scanned": len(items), "items": [item.model_dump() for item in items]}
    
    except Exception as e:
        logger.error(f"❌ Error al escanear: {e}")
        raise HTTPException(status_code=500, detail="Error al escanear archivos")

@app.delete("/api/media/{media_id}")
async def delete_media(media_id: str):
    """Eliminar un item de media del estado activo"""
    removed = media_state.remove_item(media_id)
    
    if removed:
        # Notificar a overlays
        await manager.broadcast_to_overlays({
            "action": "remove_media",
            "media_id": media_id,
            "version": media_state.version,
            "checksum": media_state.checksum
        })
        
        logger.info(f"🗑️ Media eliminada vía API: {removed.filename}")
        return {"status": "deleted", "id": media_id}
    
    raise HTTPException(status_code=404, detail="Media no encontrada")

@app.delete("/api/media/library/{filename}")
async def delete_from_library(filename: str):
    """Eliminar archivo de la biblioteca y sistema de archivos"""
    try:
        # Buscar el archivo por nombre
        file_path = config.MEDIA_PATH / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        # Eliminar archivo
        deleted_file = None
        try:
            file_path.unlink()  # Eliminar archivo
            deleted_file = file_path.name
            logger.info(f"🗑️ Archivo eliminado de biblioteca: {deleted_file}")
        except Exception as e:
            logger.error(f"Error eliminando archivo {file_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Error eliminando archivo: {e}")
        
        if deleted_file:
            # Buscar medios activos que usen este archivo para eliminarlos también
            items_to_remove = []
            for media_id, item in media_state.items.items():
                if item.filename == filename or filename in item.url:
                    items_to_remove.append(media_id)
            
            # Remover todos los elementos activos que usan este archivo
            for media_id in items_to_remove:
                removed_from_overlay = media_state.remove_item(media_id)
                
                if removed_from_overlay:
                    # Notificar a overlays que se eliminó
                    await manager.broadcast_to_overlays({
                        "action": "remove_media",
                        "media_id": media_id,
                        "version": media_state.version,
                        "checksum": media_state.checksum
                    })
                    
                    await manager.broadcast_to_controls({
                        "action": "media_removed",
                        "media_id": media_id,
                        "version": media_state.version
                    })
            
            return {
                "status": "deleted", 
                "filename": deleted_file,
                "removed_from_overlay_count": len(items_to_remove)
            }
        else:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al eliminar de biblioteca: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.post("/api/media/upload")
async def upload_media(file: UploadFile = File(...)):
    """Subir archivo de media con validación"""
    try:
        if file.size and file.size > config.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"Archivo demasiado grande. Máximo: {config.MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        allowed_types = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg'
        ]
        
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de archivo no permitido: {file.content_type}"
            )
        
        file_extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = config.MEDIA_PATH / unique_filename
        
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        media_id = str(uuid.uuid4())
        media_type = "video" if file.content_type.startswith('video/') else "image"
        
        media_item = MediaItem(
            id=media_id,
            type=media_type,
            filename=file.filename,
            url=f"/static/media/{unique_filename}"
        )
        
        # NO agregar al estado aquí, solo a la biblioteca
        
        logger.info(f"📁 Archivo subido: {file.filename} ({file.content_type})")
        
        return {
            "id": media_id,
            "url": media_item.url,
            "item": media_item.model_dump()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al subir archivo: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

# ==========================================
# STARTUP EVENT
# ==========================================

@app.on_event("startup")
async def startup_event():
    """Evento de inicio mejorado"""
    logger.info("🚀 OBS Media Control v2.0 iniciado correctamente")
    
    # Validar estado inicial
    invalid_count = await validate_media_state()
    if invalid_count > 0:
        logger.info(f"🧹 {invalid_count} elementos inválidos limpiados al inicio")
    
    # Inicializar checksum
    if not media_state.checksum:
        media_state.checksum = media_state.calculate_checksum()
    
    logger.info(f"   Estado inicial: v{media_state.version} checksum:{media_state.checksum}")
    logger.info(f"   Media path: {config.MEDIA_PATH}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="localhost", port=port, log_level="info")