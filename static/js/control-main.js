// static/js/control-main.js - MEJORADO CON ESTADO VERSIONADO
import WebSocketManager from './modules/websocket-manager.js';
import MediaManager from './modules/media-manager.js';
import UIManager from './modules/ui-manager.js';

class ControlPanel {
    constructor() {
        this.wsManager = WebSocketManager;
        this.mediaManager = new MediaManager();
        this.uiManager = new UIManager();
        
        this.selectedItemId = null;
        this.isInitialized = false;
        
        // Control de operaciones
        this.operationsInProgress = new Set();
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            console.log('🎮 Inicializando Control Panel v2.0...');
            
            // Inicializar UI Manager
            this.uiManager.init();
            
            // Configurar URL del overlay para OBS
            const overlayUrl = `${window.location.protocol}//${window.location.host}/obs-output`;
            this.uiManager.setOverlayUrl(overlayUrl);
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Conectar WebSocket
            await this.wsManager.connect('/ws/control');
            
            // Cargar medios iniciales
            await this.mediaManager.scanMedia();
            
            this.isInitialized = true;
            console.log('✅ Control Panel inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error al inicializar Control Panel:', error);
            this.uiManager.showNotification('Error al inicializar la aplicación', 'error');
        }
    }

    setupEventListeners() {
        // WebSocket events - mejorados con versionado
        this.wsManager.onConnectionChange(this.handleConnectionChange.bind(this));
        this.wsManager.onMessage('sync_state', this.handleSyncState.bind(this));
        this.wsManager.onMessage('property_updated', this.handlePropertyUpdated.bind(this));
        this.wsManager.onMessage('media_added', this.handleMediaAdded.bind(this));
        this.wsManager.onMessage('media_removed', this.handleMediaRemoved.bind(this));
        this.wsManager.onMessage('overlay_cleared', this.handleOverlayCleared.bind(this));
        this.wsManager.onMessage('version_check', this.handleVersionCheck.bind(this));
        this.wsManager.onMessage('operation_response', this.handleOperationResponse.bind(this));
        
        // Media Manager events
        this.mediaManager.onLibraryUpdate(this.handleLibraryUpdate.bind(this));
        this.mediaManager.onUploadComplete(this.handleUploadComplete.bind(this));
        
        // UI Manager events
        this.uiManager.on('mediaItemClick', this.handleMediaItemClick.bind(this));
        this.uiManager.on('mediaSelect', this.handleMediaSelect.bind(this));
        this.uiManager.on('propertyChange', this.handlePropertyChange.bind(this));
        this.uiManager.on('filesSelected', this.handleFilesSelected.bind(this));
        this.uiManager.on('filesDropped', this.handleFilesDropped.bind(this));
    }

    // WebSocket Event Handlers
    handleConnectionChange(connected) {
        this.uiManager.updateConnectionStatus(connected);
        
        if (connected) {
            this.uiManager.showNotification('Conectado al servidor', 'success');
            // Solicitar sincronización al conectar
            this.requestStateSync();
        } else {
            this.uiManager.showNotification('Desconectado del servidor', 'warning');
        }
    }

    handleSyncState(data) {
        console.log(`🔄 Sincronizando estado: v${data.version} checksum:${data.checksum}`);
        
        // Actualizar versión local
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        if (data.state && data.state.items) {
            // Limpiar y actualizar estado local
            this.mediaManager.clearActiveMedia();
            
            Object.values(data.state.items).forEach(item => {
                this.mediaManager.addActiveMedia(item);
            });
            
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
            
            const itemCount = Object.keys(data.state.items).length;
            console.log(`✅ Estado sincronizado: ${itemCount} elementos (v${data.version})`);
        }
    }

    handlePropertyUpdated(data) {
        console.log(`🔧 Propiedad actualizada: ${data.media_id}.${data.property} (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        // Actualizar estado local cuando se modifica desde el overlay
        if (data.media_id && this.mediaManager.getActiveMedia()[data.media_id]) {
            this.mediaManager.updateActiveMedia(data.media_id, data.property, data.value);
            
            // Si es el item seleccionado, actualizar controles
            if (this.selectedItemId === data.media_id) {
                const media = this.mediaManager.getActiveMedia()[data.media_id];
                this.uiManager.showProperties(media);
            }
            
            // Actualizar UI
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
        }
    }

    handleMediaAdded(data) {
        console.log(`➕ Media agregada: ${data.media.filename} (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        if (data.media) {
            this.mediaManager.addActiveMedia(data.media);
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
        }
    }

    handleMediaRemoved(data) {
        console.log(`➖ Media eliminada: ${data.media_id} (v${data.version})`);
        
        // Actualizar versión
        if (data.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        if (data.media_id) {
            this.mediaManager.removeActiveMedia(data.media_id);
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
            
            // Si era el item seleccionado, deseleccionar
            if (this.selectedItemId === data.media_id) {
                this.selectedItemId = null;
                this.uiManager.hideProperties();
            }
        }
    }

    handleOverlayCleared(data) {
        console.log(`🧹 Overlay limpiado (v${data?.version})`);
        
        // Actualizar versión
        if (data?.version !== undefined) {
            this.wsManager.updateStateVersion(data.version, data.checksum);
        }
        
        this.mediaManager.clearActiveMedia();
        this.uiManager.updateActiveMedia({});
        this.selectedItemId = null;
        this.uiManager.hideProperties();
    }

    handleVersionCheck(data) {
        if (data.needs_sync) {
            console.warn(`⚠️ Desincronización detectada, solicitando estado actualizado`);
            // El servidor enviará el estado completo automáticamente
        }
    }

    handleOperationResponse(data) {
        // Manejado por WebSocketManager, pero podemos agregar lógica adicional aquí
        if (data.response && !data.response.success) {
            this.uiManager.showNotification(`Error: ${data.response.error}`, 'error');
        }
    }

    // Solicitar sincronización
    requestStateSync() {
        console.log('🔄 Solicitando sincronización del estado...');
        this.wsManager.send({
            action: 'request_sync'
        });
    }

    // Media Manager Event Handlers
    handleLibraryUpdate(mediaLibrary) {
        this.uiManager.updateMediaLibrary(mediaLibrary);
    }

    handleUploadComplete(data) {
        this.uiManager.showNotification(`Archivo subido: ${data.item.filename}`, 'success');
        this.uiManager.hideUploadProgress();
    }

    // UI Manager Event Handlers
    handleMediaItemClick(media) {
        this.toggleMediaInOverlay(media);
    }

    handleMediaSelect(media) {
        this.selectItem(media);
    }

    handlePropertyChange(data) {
        const operationId = `update_${data.mediaId}_${data.property}`;
        this.operationsInProgress.add(operationId);
        
        this.sendPropertyUpdate(data.mediaId, data.property, data.value)
            .finally(() => {
                setTimeout(() => this.operationsInProgress.delete(operationId), 100);
            });
    }

    handleFilesSelected(files) {
        this.uploadFiles(files);
    }

    handleFilesDropped(files) {
        this.uploadFiles(files);
    }

    // Core Methods - Mejorados con confirmaciones
    toggleMediaInOverlay(media) {
        const activeMedia = this.mediaManager.getActiveMedia();
        
        if (activeMedia[media.id]) {
            // Remover del overlay
            this.removeFromOverlay(media.id);
        } else {
            // Agregar al overlay
            this.addToOverlay(media);
        }
    }

    async addToOverlay(media) {
        try {
            // Preparar datos del media con configuración por defecto
            const mediaData = {
                ...media,
                position: { x: 100, y: 100 },
                size: { width: 200, height: 200 },
                opacity: 1,
                volume: 1,
                visible: true,
                z_index: Object.keys(this.mediaManager.getActiveMedia()).length
            };
            
            // Enviar con confirmación
            const response = await this.wsManager.sendWithConfirmation({
                action: 'add_media',
                media: mediaData
            });
            
            console.log('✅ Media agregada con éxito');
            
            // Actualizar estado local optimistamente
            this.mediaManager.addActiveMedia(mediaData);
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
            
        } catch (error) {
            console.error('❌ Error al agregar media al overlay:', error);
            this.uiManager.showNotification('Error al agregar elemento', 'error');
            // Solicitar resincronización si falla
            setTimeout(() => this.requestStateSync(), 1000);
        }
    }

    async removeFromOverlay(mediaId) {
        try {
            console.log('🗑️ Solicitando eliminación de:', mediaId);
            
            // Enviar con confirmación
            const response = await this.wsManager.sendWithConfirmation({
                action: 'remove_media',
                media_id: mediaId
            });
            
            console.log('✅ Media eliminada con éxito');
            
            // Actualizar estado local optimistamente
            this.mediaManager.removeActiveMedia(mediaId);
            this.uiManager.updateActiveMedia(this.mediaManager.getActiveMedia());
            
            // Si era el item seleccionado, ocultar propiedades
            if (this.selectedItemId === mediaId) {
                this.selectedItemId = null;
                this.uiManager.hideProperties();
            }
            
        } catch (error) {
            console.error('❌ Error al eliminar media del overlay:', error);
            this.uiManager.showNotification('Error al eliminar elemento', 'error');
            // Solicitar resincronización si falla
            setTimeout(() => this.requestStateSync(), 1000);
        }
    }

    selectItem(media) {
        this.selectedItemId = media.id;
        this.uiManager.selectMedia(media.id);
    }

    async sendPropertyUpdate(mediaId, property, value) {
        try {
            // Actualizar localmente primero para respuesta inmediata
            this.mediaManager.updateActiveMedia(mediaId, property, value);
            
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
            // Revertir cambio si falla
            this.requestStateSync();
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
            
            // Subir archivos
            const results = await this.mediaManager.uploadFiles(files);
            
            // Mostrar resultados
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            if (successful > 0) {
                this.uiManager.showNotification(`${successful} archivo(s) subido(s) correctamente`, 'success');
            }
            
            if (failed > 0) {
                this.uiManager.showNotification(`${failed} archivo(s) falló la subida`, 'error');
                results.filter(r => !r.success).forEach(result => {
                    console.error(`Error subiendo ${result.file}:`, result.error);
                });
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
            
            // Limpiar estado local
            this.mediaManager.clearActiveMedia();
            this.selectedItemId = null;
            
            // Actualizar UI
            this.uiManager.updateActiveMedia({});
            this.uiManager.hideProperties();
            
            this.uiManager.showNotification('Overlay limpiado', 'success');
            
        } catch (error) {
            console.error('❌ Error al limpiar overlay:', error);
            this.uiManager.showNotification('Error al limpiar overlay', 'error');
        }
    }

    copyUrl() {
        const urlInput = document.getElementById('overlayUrl');
        if (urlInput) {
            urlInput.select();
            document.execCommand('copy');
            
            // Feedback visual
            this.uiManager.showNotification('URL copiada al portapapeles', 'success');
        }
    }

    // Public API para funciones globales
    getSelectedItemId() {
        return this.selectedItemId;
    }

    // Método de depuración
    getDebugInfo() {
        return {
            wsState: this.wsManager.getDebugInfo(),
            localMediaCount: Object.keys(this.mediaManager.getActiveMedia()).length,
            operationsInProgress: this.operationsInProgress.size,
            selectedId: this.selectedItemId
        };
    }

    // Cleanup
    destroy() {
        this.wsManager.disconnect();
        this.isInitialized = false;
    }
}

// Crear instancia global
const controlPanel = new ControlPanel();

// Funciones globales para compatibilidad con HTML
window.scanMedia = () => controlPanel.scanMedia();
window.clearAll = () => controlPanel.clearAll();
window.copyUrl = () => controlPanel.copyUrl();
window.removeFromOverlay = (mediaId) => controlPanel.removeFromOverlay(mediaId);
window.uploadFile = (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        controlPanel.uploadFiles(files);
    }
    event.target.value = ''; // Reset input
};

// API de depuración
window.debugControl = {
    getInfo: () => controlPanel.getDebugInfo(),
    forceSync: () => controlPanel.requestStateSync(),
    getVersion: () => controlPanel.wsManager.getStateVersion(),
    getChecksum: () => controlPanel.wsManager.getStateChecksum()
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => controlPanel.init());
} else {
    controlPanel.init();
}

// Log de depuración disponible
console.log('🔧 API de depuración disponible: window.debugControl');

// Exportar para uso como módulo
export default controlPanel;