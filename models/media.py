# models/media.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, List
from datetime import datetime
import hashlib
import json

class MediaItem(BaseModel):
    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat() if v else None
        }
    )
    
    id: str
    type: str  # "image", "video", "text"
    filename: str = ""
    url: str = ""
    position: Dict[str, float] = {"x": 100, "y": 100}
    size: Dict[str, float] = {"width": 200, "height": 200}
    opacity: float = 1.0
    volume: float = 1.0
    visible: bool = True
    z_index: int = 0
    created_at: Optional[datetime] = None
    
    # Propiedades específicas para texto
    text_content: Optional[str] = None
    font_family: str = "Arial"
    font_size: int = 48
    font_weight: str = "normal"  # "normal", "bold"
    font_style: str = "normal"  # "normal", "italic"
    text_align: str = "left"  # "left", "center", "right"
    text_color: str = "#ffffff"
    text_shadow: bool = False
    text_shadow_color: str = "#000000"
    text_shadow_blur: int = 2
    text_shadow_offset: Dict[str, int] = {"x": 1, "y": 1}
    background_color: Optional[str] = None  # Color de fondo opcional
    padding: Dict[str, int] = {"top": 10, "right": 10, "bottom": 10, "left": 10}
    
    def __init__(self, **data):
        if 'created_at' not in data or data['created_at'] is None:
            data['created_at'] = datetime.now()
        super().__init__(**data)

class MediaState(BaseModel):
    items: Dict[str, MediaItem] = {}
    version: int = 0
    checksum: Optional[str] = None
    last_modified: Optional[datetime] = None
    
    def calculate_checksum(self) -> str:
        """Calcular checksum del estado actual"""
        # Crear una representación ordenada del estado
        state_dict = {
            'items': {
                k: v.model_dump(exclude={'created_at'}) 
                for k, v in sorted(self.items.items())
            }
        }
        state_str = json.dumps(state_dict, sort_keys=True)
        return hashlib.md5(state_str.encode()).hexdigest()[:8]
    
    def update_version(self):
        """Incrementar versión y actualizar checksum"""
        self.version += 1
        self.checksum = self.calculate_checksum()
        self.last_modified = datetime.now()
    
    def add_item(self, item: MediaItem):
        """Agregar item y actualizar versión"""
        self.items[item.id] = item
        self.update_version()
    
    def remove_item(self, item_id: str) -> Optional[MediaItem]:
        """Remover item y actualizar versión"""
        if item_id in self.items:
            removed = self.items.pop(item_id)
            self.update_version()
            return removed
        return None
    
    def update_item(self, item_id: str, updates: dict):
        """Actualizar item y versión"""
        if item_id in self.items:
            item_dict = self.items[item_id].model_dump()
            item_dict.update(updates)
            self.items[item_id] = MediaItem(**item_dict)
            self.update_version()
    
    def clear(self):
        """Limpiar todos los items"""
        self.items.clear()
        self.update_version()

class OperationRequest(BaseModel):
    """Modelo para solicitudes con confirmación"""
    request_id: str
    action: str
    timestamp: datetime = None
    data: Optional[dict] = None
    
    def __init__(self, **data):
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now()
        super().__init__(**data)

class OperationResponse(BaseModel):
    """Modelo para respuestas del servidor"""
    request_id: str
    success: bool
    action: str
    version: int
    checksum: str
    error: Optional[str] = None
    data: Optional[dict] = None