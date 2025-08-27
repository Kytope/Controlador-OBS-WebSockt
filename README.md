# 🎬 Controlador OBS WebSocket

Control en tiempo real de imágenes y videos para tus streams en OBS Studio mediante WebSocket.

## 🚀 Características

- **📁 Biblioteca de Medios**: Gestiona imágenes y videos fácilmente
- **🎯 Control en Tiempo Real**: Actualiza el overlay instantáneamente vía WebSocket
- **⚙️ Ajustes Dinámicos**: Controla opacidad, volumen, posición y tamaño
- **📱 Interfaz Web**: Panel de control y vista de overlay responsive
- **🔄 Estado Sincronizado**: Sistema de versionado para mantener la sincronía
- **📝 Editor de Texto**: Añade texto personalizable con múltiples propiedades

## 🛠️ Tecnologías

- **Backend**: FastAPI + WebSocket
- **Frontend**: HTML5 + JavaScript + CSS3
- **Base de Datos**: Estado en memoria con persistencia
- **Deployment**: Railway + Docker

## 📦 Instalación

### Requisitos
- Python 3.8+
- OBS Studio

### Instalación Local

1. Clona el repositorio:
```bash
git clone https://github.com/Kytope/Controlador-OBS-WebSockt.git
cd Controlador-OBS-WebSockt
```

2. Instala las dependencias:
```bash
pip install -r requirements.txt
```

3. Ejecuta la aplicación:
```bash
python main.py
```

4. Abre tu navegador en `http://localhost:8000`

### Deployment en Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

## 🎮 Uso

### 1. Panel de Control (`/control`)
- Sube imágenes y videos
- Gestiona la biblioteca de medios
- Controla elementos en tiempo real
- Ajusta propiedades (posición, tamaño, opacidad)

### 2. Vista Overlay (`/overlay`)
- Usa esta URL como Browser Source en OBS
- Se actualiza automáticamente con los cambios
- Soporta drag & drop para reposicionar elementos

### 3. Configuración OBS
1. Añade una fuente "Browser Source"
2. URL: `http://localhost:8000/overlay` (o tu URL de deployment)
3. Resolución: 1920x1080
4. Marca "Shutdown source when not visible" y "Refresh browser when scene becomes active"

## 🔧 Funcionalidades

### Tipos de Media Soportados
- **Imágenes**: JPG, PNG, GIF, WEBP
- **Videos**: MP4, WEBM, OGG
- **Texto**: Editor con propiedades personalizables

### Controles Disponibles
- ✅ Mostrar/Ocultar elementos
- 🎚️ Ajustar opacidad (0-100%)
- 🔊 Control de volumen para videos
- 📐 Redimensionar y reposicionar
- 🎨 Propiedades de texto (fuente, color, sombra)
- 🗑️ Eliminar elementos

### API Endpoints

#### Estado
- `GET /health` - Estado de la aplicación
- `GET /api/state/version` - Versión del estado actual

#### Medios
- `GET /api/media` - Obtener biblioteca completa
- `POST /api/media/upload` - Subir archivo
- `DELETE /api/media/{id}` - Eliminar del overlay
- `DELETE /api/media/library/{filename}` - Eliminar del sistema

## 🌐 WebSocket API

### Conexiones
- `/ws/control` - Para panel de control
- `/ws/overlay` - Para vista de overlay

### Mensajes Soportados
```javascript
// Agregar media
{
    "action": "add_media",
    "media": {
        "id": "uuid",
        "type": "image|video|text",
        "url": "/static/media/file.png",
        "position": {"x": 100, "y": 100},
        "size": {"width": 200, "height": 200}
    }
}

// Actualizar propiedad
{
    "action": "update_property",
    "media_id": "uuid",
    "property": "opacity",
    "value": 0.5
}

// Eliminar media
{
    "action": "remove_media",
    "media_id": "uuid"
}
```

## 📂 Estructura del Proyecto

```
├── main.py                 # Aplicación principal FastAPI
├── connection_manager.py   # Gestor de conexiones WebSocket
├── models/
│   └── media.py           # Modelos de datos
├── templates/
│   ├── index.html         # Página principal
│   ├── control.html       # Panel de control
│   └── overlay.html       # Vista overlay para OBS
├── static/
│   ├── css/               # Estilos
│   ├── js/                # JavaScript del frontend
│   └── media/             # Archivos de media subidos
├── requirements.txt       # Dependencias Python
└── Dockerfile            # Configuración Docker
```

## 🚀 Deploy

### Variables de Entorno
- `PORT`: Puerto del servidor (default: 8000)
- `MAX_FILE_SIZE`: Tamaño máximo de archivo en bytes
- `MAX_CONNECTIONS`: Máximo de conexiones WebSocket
- `MEDIA_PATH`: Ruta de almacenamiento de medios

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🆘 Soporte

Si tienes problemas o preguntas:
- Abre un [Issue](https://github.com/Kytope/Controlador-OBS-WebSockt/issues)
- Revisa la documentación
- Contacta al desarrollador

---

Desarrollado con ❤️ para la comunidad de streamers