// static/js/modules/overlay-editor-main.js - MEJORADO CON ESTADO VERSIONADO
import WebSocketManager from './modules/websocket-manager.js';
import MediaManager from './modules/media-manager.js';
import CanvasManager from './modules/canvas-manager.js';
import UIManager from './modules/ui-manager.js';

class OverlayEditor {
    constructor() {
        this.wsManager = WebSocketManager;
        this.mediaManager = new MediaManager();
        this.canvasManager = null;
        this.uiManager = new UIManager();
        
        this.isInitialized = false;
        this.pendingSyncRequest = false;
        
        // Control de operaciones
        this.operationsInProgress = new Set();
        
        // Verificación de sincronización
        this.syncCheckInterval = null;
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            console.log('🚀 Inicializando Overlay Editor v2.0...');
            
            // Inicializar UI Manager
            this.uiManager.init();
            
            // Inicializar Canvas Manager
            const canvasElement = document.getElementById('overlay-canvas');
            if (!canvasElement) {
                throw new Error('Elemento canvas no encontrado');
            }
            
            this.canvasManager = new CanvasManager(canvasElement, {
                scale: 0.6,
                width: 1920,
                height: 1080,
                updateThrottleMs: 16
            });
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Conectar WebSocket
            await this.wsManager.connect('/ws/overlay');
            
            // Limpiar estado antes de sincronizar
            this.clearLocalState();
            
            // Solicitar sincronización inmediata
            this.requestStateSync();
            
            // Cargar biblioteca de medios
            await this.mediaManager.scanMedia();
            
            // Iniciar verificación periódica de sincronización
            this.startSyncVerification();
            
            this.isInitialized = true;
            console.log('✅ Overlay Editor inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error al inicializar Overlay Editor:', error);
            this.uiManager.showNotification('Error al inicializar la aplicación', 'error');
        }
    }

    setupEventListeners() {
        // WebSocket events - con manejo de versiones
        this.wsManager.onConnectionChange(this.handleConnectionChange.bind(this));
        this.wsManager.onMessage('add_media', this.handleAddMedia.bind(this));
        this.wsManager.onMessage('remove_media', this.handleRemoveMedia.bind(this));
        this.wsManager.onMessage('update_property', this.handleUpdateProperty.bind(this));
        this.wsManager.onMessage('sync_state', this.handleSyncState.bind(this));
        this.wsManager.onMessage('clear_all', this.handleClearAll.bind(this));
        this.wsManager.onMessage('operation_response', this.handleOperationResponse.bind(this));
        
        // Media Manager events
        this.mediaManager.onLibraryUpdate(this.handleLibraryUpdate.bind(this));
        this.mediaManager.onUploadComplete(this.handleUploadComplete.bind(this));
        
        // Canvas Manager events
        this.canvasManager.on('elementSelect', this.handleElementSelect.bind(this));
        this.canvasManager.on('elementMove', this.handleElementMove.bind(this));
        this.canvasManager.on('elementResize', this.handleElementResize.bind(this));
        this.canvasManager.on('elementDelete', this.handleElementDelete.bind(this));
        this.canvasManager.on('canvasDrop', this.handleCanvasDrop.bind(this));
        this.canvasManager.on('elementDragging', this.handleElementDragging.bind(this)); // Drag continuo
        this.canvasManager.on('elementResizing', this.handleElementResizing.bind(this)); // Resize continuo
        
        // UI Manager events
        this.uiManager.on('mediaItemClick', this.handleMediaItemClick.bind(this));
        this.uiManager.on('mediaSelect', this.handleMediaSelect.bind(this));
        this.uiManager.on('propertyChange', this.handlePropertyChange.bind(this));
        this.uiManager.on('filesSelected', this.handleFilesSelected.bind(this));
        this.uiManager.on('filesDropped', this.handleFilesDropped.bind(this));
        this.uiManager.on('mediaDragStart', this.handleMediaDragStart.bind(this));
        this.uiManager.on('mediaDragEnd', this.handleMediaDragEnd.bind(this));
    }

    // Limpieza de estado local
    clearLocalState() {
        console.log('🧹 Limpiando estado local...');
        this.mediaManager.clearActiveMedia();
        this.canvasManager.clearElements();
        this.uiManager.updateActiveMedia({});
        this.uiManager.hideProperties();
    }

    // Solicitud de sincronización
    requestStateSync() {
        if (this.wsManager.isConnected() && !this.pendingSyncRequest) {
            console.log('🔄 Solicitando sincronización del estado...');
            this.pendingSyncRequest = true;
            
            // Enviar solicitud simple sin confirmación para evitar loops
            this.wsManager.send({
                action: 'request_sync'
            });
            
            // Timeout para solicitud
            setTimeout(() => {
                this.pendingSyncRequest = false;
                if (this.canvasManager.getAllElements().length === 0) {
                    console.warn('⚠️ No se recibió sincronización, reintentando...');
                    this.requestStateSync();
                }
            }, 5000);
        }
    }

    // Verificación periódica de sincronización
    startSyncVerification() {
        // Verificar cada 45 segundos
        this.syncCheckInterval = setInterval(() => {
            if (this.wsManager.isConnected()) {
                const localCount = Object.keys(this.mediaManager.getActiveMedia()).length;
                const canvasCount = this.canvasManager.getAllElements().length;
                
                if (localCount !== canvasCount) {
                    console.warn(`⚠️ Desincronización detectada: ${localCount} en estado vs ${canvasCount} en canvas`);
                    this.requestStateSync();
                }
            }
        }, 120000); // 120 segundos
    }

    // WebSocket Event Handlers
    handleConnectionChange(connected) {
    this.uiManager.updateConnectionStatus(connected);
    
    if (connected) {
        this.uiManager.showNotification('Conectado al servidor', 'success');
        
        // SOLO limpiar si realmente es necesario
        if (this.canvasManager.getAllElements().length === 0) {
            console.log('📡 Solicitando estado inicial...');
            setTimeout(() => this.requestStateSync(), 500);
        } else {
            console.log('📡 Reconectado - manteniendo estado actual');
        }
    } else {
        this.uiManager.showNotification('Desconectado del servidor', 'warning');
    }
    }

    handleSyncState(data) {
        console.log(`🔄 Sincronizando estado desde servidor: v${data.version} checksum:${data.checksum}`);
        this.pendingSyncRequest = false;
        
        // Actualizar versión local
        this.wsManager.updateStateVersion(data.version, data.checksum);
        
        const state = data.state;
        
        // Limpiar completamente antes de sincronizar
        this.clearLocalState();
        
        if (state && state.items) {
            const itemCount = Object.keys(state.items).length;
            console.log(`📊 Sincronizando ${itemCount} elementos del servidor`);
            
            // Agregar todos los elementos del servidor
            Object.values(state.items).forEach(media => {
                this.mediaManager.addActiveMedia(media);
                this.canvasManager.addElement(media);
            });
            
            // Actualizar UI
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
            
            console.log(`✅ Estado sincronizado: ${itemCount} elementos (v${data.version})`);
            this.uiManager.showNotification(`Estado sincronizado: ${itemCount} elementos`, 'info', 2000);
        } else {
            console.log('✅ Estado vacío sincronizado');
            this.uiManager.showNotification('Estado vacío sincronizado', 'info', 2000);
        }
    }

    handleAddMedia(data) {
        const media = data.media;
        console.log(`➕ add_media recibido: ${media.filename || media.id} (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        // SIEMPRE procesar el add_media, incluso si viene de nosotros mismos
        // porque el servidor ya validó y asignó el ID final
        this.mediaManager.addActiveMedia(media);
        
        if (this.canvasManager.getElement(media.id)) {
            this.canvasManager.updateElement(media);
        } else {
            this.canvasManager.addElement(media);
        }
        
        this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
        
        // Limpiar la operación en progreso si existe
        if (this.operationsInProgress.has(`add_${media.id}`)) {
            this.operationsInProgress.delete(`add_${media.id}`);
        }
    }

    handleRemoveMedia(data) {
        const mediaId = data.media_id;
        console.log(`➖ remove_media recibido: ${mediaId} (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        // Eliminar del estado y canvas
        this.mediaManager.removeActiveMedia(mediaId);
        this.canvasManager.removeElement(mediaId);
        
        // Actualizar UI
        this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
        
        // Deseleccionar si era el elemento seleccionado
        if (this.uiManager.getSelectedMediaId() === mediaId) {
            this.uiManager.hideProperties();
            this.canvasManager.deselectAllSilent();
        }
    }

    handleUpdateProperty(data) {
        const { media_id, property, value } = data;
        console.log(`🔧 update_property recibido: ${media_id}.${property} (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        // Verificar si es una operación que nosotros iniciamos
        if (this.operationsInProgress.has(`update_${media_id}_${property}`)) {
            console.log('ℹ️ Ignorando eco de nuestra propia operación');
            return;
        }
        
        // Actualizar estado local
        this.mediaManager.updateActiveMedia(media_id, property, value);
        const updatedMedia = this.mediaManager.getActiveMedia()[media_id];
        
        if (updatedMedia) {
            this.canvasManager.updateElement(updatedMedia);
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
            
            // Si es el elemento seleccionado, actualizar propiedades
            if (this.uiManager.getSelectedMediaId() === media_id) {
                this.uiManager.showProperties(updatedMedia);
            }
        }
    }

    handleClearAll(data) {
        console.log(`🧹 clear_all recibido (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        // Limpiar todo
        this.clearLocalState();
    }

    handleOperationResponse(data) {
        // Manejado por WebSocketManager
        console.log('✅ Respuesta de operación recibida');
    }

    // Canvas Event Handlers
    handleElementSelect(media) {
    console.log('📍 Elemento seleccionado en canvas:', media.id);
    this.uiManager.selectMediaSilent(media.id);
    // Asegurar que el estado interno también se actualiza
    this.selectedMediaId = media.id; // Agregar esta línea
}

    handleElementMove(data) {
        const operationId = `update_${data.id}_position`;
        this.operationsInProgress.add(operationId);
        
        this.sendPropertyUpdate(data.id, 'position', data.position)
            .finally(() => {
                setTimeout(() => this.operationsInProgress.delete(operationId), 100);
            });
    }
    
    // NUEVO: Manejar drag continuo para transmisión en tiempo real
    handleElementDragging(data) {
        // Enviar actualización de posición sin confirmación para velocidad
        this.wsManager.send({
            action: 'update_property',
            media_id: data.id,
            property: 'position',
            value: data.position
        });
        
        // Actualizar localmente también
        this.mediaManager.updateActiveMedia(data.id, 'position', data.position);
    }
    
    // NUEVO: Manejar resize continuo para transmisión en tiempo real
    handleElementResizing(data) {
        // Enviar actualizaciones sin confirmación para velocidad
        if (data.size) {
            this.wsManager.send({
                action: 'update_property',
                media_id: data.id,
                property: 'size',
                value: data.size
            });
            this.mediaManager.updateActiveMedia(data.id, 'size', data.size);
        }
        
        if (data.position) {
            this.wsManager.send({
                action: 'update_property',
                media_id: data.id,
                property: 'position',
                value: data.position
            });
            this.mediaManager.updateActiveMedia(data.id, 'position', data.position);
        }
    }

    handleElementResize(data) {
        const sizeOpId = `update_${data.id}_size`;
        const posOpId = `update_${data.id}_position`;
        
        this.operationsInProgress.add(sizeOpId);
        if (data.position) {
            this.operationsInProgress.add(posOpId);
        }
        
        const promises = [
            this.sendPropertyUpdate(data.id, 'size', data.size)
        ];
        
        if (data.position) {
            promises.push(this.sendPropertyUpdate(data.id, 'position', data.position));
        }
        
        Promise.all(promises).finally(() => {
            setTimeout(() => {
                this.operationsInProgress.delete(sizeOpId);
                this.operationsInProgress.delete(posOpId);
            }, 100);
        });
    }

    handleElementDelete(mediaId) {
        this.removeMedia(mediaId);
    }

    handleCanvasDrop(data) {
        const mediaId = data.event.dataTransfer.getData('text/plain');
        const media = this.mediaManager.getMediaById(mediaId);
        
        if (media) {
            this.addMediaToCanvas(media, data.x, data.y);
        }
    }

    // UI Event Handlers
    handleMediaItemClick(media) {
        this.addMediaToCanvas(media);
    }

    handleMediaSelect(media) {
        this.canvasManager.selectElementSilent(media.id);
    }

    handlePropertyChange(data) {
        const operationId = `update_${data.mediaId}_${data.property}`;
        this.operationsInProgress.add(operationId);
        
        this.sendPropertyUpdate(data.mediaId, data.property, data.value)
            .finally(() => {
                setTimeout(() => this.operationsInProgress.delete(operationId), 100);
            });
    }

    handleLibraryUpdate(mediaLibrary) {
        this.uiManager.updateMediaLibrary(mediaLibrary);
    }

    handleUploadComplete(data) {
        this.uiManager.showNotification(`Archivo subido: ${data.item.filename}`, 'success');
        this.uiManager.hideUploadProgress();
    }

    handleFilesSelected(files) {
        this.uploadFiles(files);
    }

    handleFilesDropped(files) {
        this.uploadFiles(files);
    }

    handleMediaDragStart(data) {
        console.log('Iniciando drag de media:', data.media.filename);
    }

    handleMediaDragEnd(data) {
        console.log('Finalizando drag de media');
    }

    // Core Methods con confirmaciones
    async addMediaToCanvas(media, x = null, y = null) {
        try {
            // Calcular posición
            if (x === null || y === null) {
                const randomOffset = () => (Math.random() - 0.5) * 100;
                x = (1920 - 200) / 2 + randomOffset();
                y = (1080 - 200) / 2 + randomOffset();
            }
            
            // Asegurar que esté dentro del canvas
            x = Math.max(0, Math.min(1920 - 200, x));
            y = Math.max(0, Math.min(1080 - 200, y));
            
            const mediaData = {
                ...media,
                position: { x, y },
                size: { width: 200, height: 200 },
                opacity: 1,
                volume: 1,
                visible: true,
                z_index: Object.keys(this.mediaManager.getActiveMedia()).length
            };
            
            // NO marcar como operación en progreso para que se procese el echo
            // const operationId = `add_${media.id}`;
            // this.operationsInProgress.add(operationId);
            
            // Enviar con confirmación
            const response = await this.wsManager.sendWithConfirmation({
                action: 'add_media',
                media: mediaData
            });
            
            console.log('✅ Media agregada con éxito:', mediaData.filename);
            
            // El handleAddMedia se encargará de actualizar el canvas cuando llegue el mensaje
            
        } catch (error) {
            console.error('❌ Error al agregar media al canvas:', error);
            this.uiManager.showNotification('Error al agregar elemento', 'error');
        }
    }

    async removeMedia(mediaId) {
        try {
            console.log('🗑️ Solicitando eliminación de:', mediaId);
            
            // Enviar con confirmación
            const response = await this.wsManager.sendWithConfirmation({
                action: 'remove_media',
                media_id: mediaId
            });
            
            console.log('✅ Media eliminada con éxito');
            
            // La actualización local vendrá del servidor
            
        } catch (error) {
            console.error('❌ Error al eliminar media:', error);
            this.uiManager.showNotification('Error al eliminar elemento', 'error');
            
            // Si falla, solicitar resincronización
            setTimeout(() => this.requestStateSync(), 1000);
        }
    }

    async sendPropertyUpdate(mediaId, property, value) {
        try {
            // Actualización optimista local
            this.mediaManager.updateActiveMedia(mediaId, property, value);
            const updatedMedia = this.mediaManager.getActiveMedia()[mediaId];
            
            if (updatedMedia) {
                this.canvasManager.updateElement(updatedMedia);
            }
            
            // Enviar al servidor con confirmación
            const response = await this.wsManager.sendWithConfirmation({
                action: 'update_property',
                media_id: mediaId,
                property: property,
                value: value
            }, 1000); // Timeout más corto para propiedades
            
            console.log(`✅ Propiedad actualizada: ${property}`);
            
        } catch (error) {
            console.error(`❌ Error al actualizar propiedad ${property}:`, error);
            
            // Revertir cambio local si falla
            this.requestStateSync();
        }
    }

    async clearAll() {
        if (!confirm('¿Estás seguro de que quieres limpiar todo el overlay?')) {
            return;
        }
        
        try {
            console.log('🧹 Solicitando limpieza total...');
            
            // Enviar con confirmación
            const response = await this.wsManager.sendWithConfirmation({
                action: 'clear_all'
            });
            
            console.log('✅ Overlay limpiado con éxito');
            this.uiManager.showNotification('Overlay limpiado', 'success');
            
            // La actualización local vendrá del servidor
            
        } catch (error) {
            console.error('❌ Error al limpiar overlay:', error);
            this.uiManager.showNotification('Error al limpiar overlay', 'error');
        }
    }

    async uploadFiles(files) {
        try {
            // Validar archivos
            const errors = this.mediaManager.validateFiles(files);
            if (errors.length > 0) {
                errors.forEach(error => {
                    this.uiManager.showNotification(error, 'error');
                });
                return;
            }
            
            this.uiManager.showUploadProgress();
            this.uiManager.updateUploadProgress(0, 'Preparando subida...');
            
            // Subir archivos uno por uno
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progress = ((i + 1) / files.length) * 100;
                
                this.uiManager.updateUploadProgress(progress, `Subiendo ${file.name}...`);
                
                try {
                    await this.mediaManager.uploadFile(file);
                } catch (error) {
                    console.error(`Error al subir ${file.name}:`, error);
                    this.uiManager.showNotification(`Error al subir ${file.name}`, 'error');
                }
            }
            
            this.uiManager.updateUploadProgress(100, '¡Subida completada!');
            
        } catch (error) {
            console.error('Error general en subida de archivos:', error);
            this.uiManager.showNotification('Error al subir archivos', 'error');
            this.uiManager.hideUploadProgress();
        }
    }

    async scanMedia() {
        try {
            await this.mediaManager.scanMedia();
            this.uiManager.showNotification('Biblioteca actualizada', 'success');
        } catch (error) {
            console.error('Error al escanear medios:', error);
            this.uiManager.showNotification('Error al actualizar biblioteca', 'error');
        }
    }

    // Layer management
    moveLayer(mediaId, direction) {
    const activeMedia = this.mediaManager.getActiveMedia();
    const media = activeMedia[mediaId];
    if (!media) return;
    
    // Obtener todos los elementos ordenados por z_index
    const allMedia = Object.values(activeMedia).sort((a, b) => a.z_index - b.z_index);
    const currentIndex = allMedia.findIndex(m => m.id === mediaId);
    
    let newZIndex = media.z_index;
    
    // LÓGICA CORREGIDA:
    // "up" significa subir en la jerarquía visual (mayor z-index)
    // "down" significa bajar en la jerarquía visual (menor z-index)
    
    if (direction === 'up' && currentIndex < allMedia.length - 1) {
        // Intercambiar con el elemento siguiente (mayor z-index)
        const nextMedia = allMedia[currentIndex + 1];
        newZIndex = nextMedia.z_index + 1;
        
        // Reorganizar z-indexes para mantener orden
        for (let i = currentIndex + 1; i < allMedia.length; i++) {
            if (allMedia[i].z_index <= newZIndex) {
                this.sendPropertyUpdate(allMedia[i].id, 'z_index', allMedia[i].z_index - 1);
            }
        }
    } else if (direction === 'down' && currentIndex > 0) {
        // Intercambiar con el elemento anterior (menor z-index)
        const prevMedia = allMedia[currentIndex - 1];
        newZIndex = prevMedia.z_index - 1;
        
        // Reorganizar z-indexes para mantener orden
        for (let i = 0; i < currentIndex; i++) {
            if (allMedia[i].z_index >= newZIndex) {
                this.sendPropertyUpdate(allMedia[i].id, 'z_index', allMedia[i].z_index + 1);
            }
        }
    }
    
    if (newZIndex !== media.z_index) {
        this.sendPropertyUpdate(mediaId, 'z_index', newZIndex);
    }
    }

    toggleVisibility(mediaId) {
        const media = this.mediaManager.getActiveMedia()[mediaId];
        if (media) {
            const newVisibility = !media.visible;
            this.sendPropertyUpdate(mediaId, 'visible', newVisibility);
        }
    }

    // Public API
    getSelectedMediaId() {
    // Primero intentar obtener del UI Manager
    const uiSelectedId = this.uiManager.getSelectedMediaId();
    
    // Si no hay en UI Manager, intentar del canvas
    const canvasSelectedId = this.canvasManager?.getSelectedMediaId();
    
    // Devolver el que esté disponible, priorizando UI
    const selectedId = uiSelectedId || canvasSelectedId || this.selectedMediaId;
    
    console.log('📍 ID seleccionado:', {
        ui: uiSelectedId,
        canvas: canvasSelectedId, 
        internal: this.selectedMediaId,
        final: selectedId
    });
    
    return selectedId;
    }

    selectMedia(mediaId) {
        this.uiManager.selectMedia(mediaId);
        this.canvasManager.selectElement(mediaId);
    }

    removeSelected() {
    const selectedId = this.getSelectedMediaId();
    console.log('🗑️ Intentando eliminar elemento seleccionado:', selectedId);
    
    if (!selectedId) {
        console.warn('⚠️ No hay elemento seleccionado para eliminar');
        this.uiManager.showNotification('Selecciona un elemento primero', 'warning');
        return;
    }
    
    if (selectedId) {
        console.log('🗑️ Eliminando elemento:', selectedId);
        this.removeMedia(selectedId);
    }
    }

    moveElement(deltaX, deltaY, fast = false) {
        const selectedId = this.getSelectedMediaId();
        if (selectedId) {
            const multiplier = fast ? 50 : 10;
            this.canvasManager.moveElementBy(selectedId, deltaX * multiplier, deltaY * multiplier);
        }
    }

    // Método de depuración
    getDebugInfo() {
        return {
            wsState: this.wsManager.getDebugInfo(),
            localMediaCount: Object.keys(this.mediaManager.getActiveMedia()).length,
            canvasElementCount: this.canvasManager.getAllElements().length,
            operationsInProgress: this.operationsInProgress.size,
            selectedId: this.getSelectedMediaId()
        };
    }

    // Funciones para texto
    createTextFromInput(textContent) {
        if (!textContent || !textContent.trim()) {
            this.uiManager.showNotification('Por favor, ingresa un texto', 'warning');
            return;
        }

        const textElement = this.mediaManager.createTextElement(textContent.trim(), {
            position: { 
                x: (1920 - 300) / 2 + (Math.random() - 0.5) * 100, 
                y: (1080 - 100) / 2 + (Math.random() - 0.5) * 100 
            },
            size: { width: 300, height: 100 },
            font_size: 48,
            text_color: '#ffffff',
            text_shadow: true
        });

        this.addMediaToCanvas(textElement);
    }

    // Cleanup
    destroy() {
        // Limpiar intervals
        if (this.syncCheckInterval) {
            clearInterval(this.syncCheckInterval);
            this.syncCheckInterval = null;
        }
        
        // Destruir componentes
        if (this.canvasManager) {
            this.canvasManager.destroy();
        }
        
        this.wsManager.disconnect();
        this.isInitialized = false;
    }
}

// Crear instancia global
const overlayEditor = new OverlayEditor();

// Funciones globales para compatibilidad con HTML
window.scanMedia = () => overlayEditor.scanMedia();
window.clearAll = () => overlayEditor.clearAll();
window.removeSelected = () => overlayEditor.removeSelected(); // ASEGURAR QUE ESTA LÍNEA EXISTE
window.moveLayer = (mediaId, direction) => overlayEditor.moveLayer(mediaId, direction);
window.toggleVisibility = (mediaId) => overlayEditor.toggleVisibility(mediaId);
window.removeMediaById = (mediaId) => overlayEditor.removeMedia(mediaId);
window.createTextFromInput = (text) => overlayEditor.createTextFromInput(text);

// API de depuración
window.debugOverlay = {
    getInfo: () => overlayEditor.getDebugInfo(),
    forceSync: () => overlayEditor.requestStateSync(),
    clearLocal: () => overlayEditor.clearLocalState(),
    getVersion: () => overlayEditor.wsManager.getStateVersion(),
    getChecksum: () => overlayEditor.wsManager.getStateChecksum()
};

let overlayEditorInstance = null;

function initializeOverlayEditor() {
    if (overlayEditorInstance) {
        console.warn('⚠️ Overlay Editor ya está inicializado');
        return overlayEditorInstance;
    }
    
    overlayEditorInstance = new OverlayEditor();
    // Exponer la instancia globalmente para las funciones del HTML
    window.overlayEditor = overlayEditorInstance;
    overlayEditorInstance.init();
    return overlayEditorInstance;
}

// Inicializar una sola vez
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOverlayEditor, { once: true });
} else {
    initializeOverlayEditor();
}

// Log de depuración disponible
console.log('🔧 API de depuración disponible: window.debugOverlay');

window.deleteMediaFromLibrary = async (filename) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este archivo de la biblioteca? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        const success = await overlayEditorInstance.mediaManager.deleteFromLibrary(filename);
        if (success) {
            overlayEditorInstance.uiManager.showNotification('Archivo eliminado de la biblioteca', 'success');
        }
    } catch (error) {
        console.error('Error eliminando de biblioteca:', error);
        overlayEditorInstance.uiManager.showNotification('Error al eliminar archivo', 'error');
    }
};

// Exportar para uso como módulo
export default overlayEditor;