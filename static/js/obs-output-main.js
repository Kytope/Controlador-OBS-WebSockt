// static/js/obs-output-main.js - SINCRONIZACIÓN PERFECTA CON OVERLAY

class OBSOutput {
    constructor() {
        this.ws = null;
        this.activeMedia = new Map();
        this.container = null;
        this.debugMode = false;
        this.isInitialized = false;
        this.reconnectDelay = 2000;
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
        this.syncRequestPending = false;
    }

    init() {
        if (this.isInitialized) return;
        
        try {
            console.log('🎬 Inicializando OBS Output...');
            
            // Cachear elementos
            this.container = document.getElementById('output-container');
            if (!this.container) {
                throw new Error('Container no encontrado');
            }
            
            // Configurar debug
            this.setupDebug();
            
            // Conectar WebSocket INMEDIATAMENTE
            this.connectWebSocket();
            
            // Configurar auto-recovery más agresivo
            this.setupAutoRecovery();
            
            this.isInitialized = true;
            console.log('✅ OBS Output inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error al inicializar OBS Output:', error);
            this.handleError(error, 'Inicialización');
        }
    }

    // WebSocket Connection - MEJORADO
    connectWebSocket() {
        // IMPORTANTE: Usar el mismo endpoint que el overlay editor
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/overlay`;
        
        console.log(`🔌 OBS Output conectando a WebSocket: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ OBS Output conectado al servidor');
            this.reconnectAttempts = 0;
            this.updateDebugStatus('Conectado');
            
            // SOLICITAR SINCRONIZACIÓN INMEDIATA
            setTimeout(() => this.requestStateSync(), 100);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 OBS Output mensaje recibido:', data);
                this.handleMessage(data);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
                this.handleError(error, 'Parse Message');
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ OBS Output WebSocket error:', error);
            this.updateDebugStatus('Error');
            this.handleError(error, 'WebSocket Error');
        };
        
        this.ws.onclose = (event) => {
            console.log('🔌 OBS Output WebSocket cerrado:', event.code, event.reason);
            this.updateDebugStatus('Reconectando...');
            this.scheduleReconnect();
        };
    }

    // MÉTODO CRÍTICO: Solicitar sincronización del estado
    requestStateSync() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.syncRequestPending) {
            console.log('🔄 OBS Output solicitando sincronización del estado...');
            this.syncRequestPending = true;
            
            this.ws.send(JSON.stringify({
                action: 'request_sync'
            }));
            
            // Timeout para solicitud de sincronización
            setTimeout(() => {
                this.syncRequestPending = false;
            }, 3000);
        } else if (this.ws?.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ OBS Output: WebSocket no está abierto, no se puede sincronizar');
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ OBS Output: Máximo número de intentos de reconexión alcanzado');
            this.updateDebugStatus('Desconectado');
            return;
        }

        this.reconnectAttempts++;
        console.log(`🔄 OBS Output reconectando en ${this.reconnectDelay}ms (intento ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connectWebSocket();
        }, this.reconnectDelay);
    }

    handleMessage(data) {
        try {
            switch(data.action) {
                case 'add_media':
                    this.handleAddMedia(data);
                    break;
                case 'remove_media':
                    this.handleRemoveMedia(data);
                    break;
                case 'update_property':
                    this.handleUpdateProperty(data);
                    break;
                case 'sync_state':
                    this.handleSyncState(data);
                    break;
                case 'clear_all':
                    this.handleClearAll();
                    break;
                default:
                    console.warn('⚠️ OBS Output acción no reconocida:', data.action);
            }
            
            this.updateDebugCount();
        } catch (error) {
            console.error('❌ OBS Output error handling message:', error);
            this.handleError(error, 'Handle Message');
        }
    }

    // Message Handlers - MEJORADOS
    handleAddMedia(data) {
        const media = data.media;
        console.log('➕ OBS Output agregando media:', media.filename || media.id);
        this.addMedia(media);
    }

    handleRemoveMedia(data) {
        const mediaId = data.media_id;
        console.log('➖ OBS Output removiendo media:', mediaId);
        this.removeMedia(mediaId);
    }

    handleUpdateProperty(data) {
        const { media_id, property, value } = data;
        console.log('🔧 OBS Output actualizando propiedad:', media_id, property, value);
        this.updateProperty(media_id, property, value);
    }

    handleSyncState(data) {
        console.log('🔄 OBS Output sincronizando estado:', data.state);
        this.syncRequestPending = false;
        this.syncState(data.state);
    }

    handleClearAll() {
        console.log('🧹 OBS Output limpiando todo');
        this.clearAll();
    }

    // Core Methods - MEJORADOS
    addMedia(media) {
        try {
            // Si ya existe, actualizar en lugar de duplicar
            if (this.activeMedia.has(media.id)) {
                console.log('🔄 OBS Output: Media ya existe, actualizando:', media.filename || media.id);
                this.updateMediaComplete(media);
                return;
            }

            const element = this.createElement(media);
            this.container.appendChild(element);
            this.activeMedia.set(media.id, {
                media: { ...media },
                element: element
            });

            console.log('✅ OBS Output media agregada:', media.filename || media.id);
            this.updateDebugCount();
        } catch (error) {
            console.error('❌ OBS Output error agregando media:', error);
            this.handleError(error, 'Add Media');
        }
    }

    createElement(media) {
        const div = document.createElement('div');
        div.id = `media-${media.id}`;
        div.className = 'media-element';
        
        // Aplicar estilos iniciales
        this.applyStyles(div, media);
        
        // Crear contenido según tipo
        if (media.type === 'image') {
            const img = document.createElement('img');
            img.src = media.url;
            img.alt = media.filename || '';
            img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;';
            
            img.onerror = () => {
                console.error('❌ OBS Output error cargando imagen:', media.url);
                div.style.display = 'none';
            };
            
            img.onload = () => {
                console.log('✅ OBS Output imagen cargada:', media.filename || media.id);
            };
            
            div.appendChild(img);
            
        } else if (media.type === 'video') {
            const video = document.createElement('video');
            video.src = media.url;
            video.autoplay = false;
            video.loop = true;
            video.muted = false;
            video.volume = Math.max(0, Math.min(1, media.volume || 1.0));
            video.preload = 'metadata';
            video.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;';
            
            video.onerror = () => {
                console.error('❌ OBS Output error cargando video:', media.url);
                div.style.display = 'none';
            };
            
            video.onloadeddata = () => {
                console.log('✅ OBS Output video cargado (pausado):', media.filename || media.id);
            };
            
            // Los videos ahora inician en pausa por defecto
            // Se pueden reproducir mediante controles o eventos
            
            div.appendChild(video);
        }

        return div;
    }

    applyStyles(element, media) {
        // Aplicar estilos exactamente como en el overlay
        const styles = {
            position: 'absolute',
            left: (media.position?.x || 0) + 'px',
            top: (media.position?.y || 0) + 'px',
            width: (media.size?.width || 200) + 'px',
            height: (media.size?.height || 200) + 'px',
            opacity: media.opacity !== undefined ? media.opacity : 1,
            zIndex: media.z_index || 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none' // Importante para OBS
        };

        Object.assign(element.style, styles);
        
        // IMPORTANTE: No mostrar elementos fuera del área visible en OBS
        element.style.display = 'block';
    }

    updateMediaComplete(media) {
        try {
            const mediaData = this.activeMedia.get(media.id);
            if (!mediaData) {
                // Si no existe, agregarlo
                this.addMedia(media);
                return;
            }

            // Actualizar datos y estilos
            mediaData.media = { ...media };
            this.applyStyles(mediaData.element, media);
            
            // Actualizar volumen si es video
            if (media.type === 'video') {
                const video = mediaData.element.querySelector('video');
                if (video && media.volume !== undefined) {
                    video.volume = Math.max(0, Math.min(1, media.volume));
                }
            }

            console.log('✅ OBS Output media actualizada completamente:', media.filename || media.id);
        } catch (error) {
            console.error('❌ OBS Output error actualizando media completa:', error);
            this.handleError(error, 'Update Media Complete');
        }
    }

    removeMedia(mediaId) {
        try {
            const mediaData = this.activeMedia.get(mediaId);
            if (!mediaData) {
                console.warn('⚠️ OBS Output: Intento de eliminar media que no existe:', mediaId);
                return;
            }

            const { element } = mediaData;
            
            // Animación de salida suave
            element.style.opacity = '0';
            element.style.transform = 'scale(0.95)';
            
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                this.activeMedia.delete(mediaId);
                this.updateDebugCount();
                console.log('✅ OBS Output media eliminada:', mediaId);
            }, 300);

        } catch (error) {
            console.error('❌ OBS Output error removiendo media:', error);
            this.handleError(error, 'Remove Media');
        }
    }

    updateProperty(mediaId, property, value) {
        try {
            const mediaData = this.activeMedia.get(mediaId);
            if (!mediaData) {
                console.warn('⚠️ OBS Output: Media no encontrada para actualizar propiedad:', mediaId);
                return;
            }

            const { media, element } = mediaData;
            
            // Actualizar datos locales
            if (property === 'position') {
                media.position = value;
                element.style.left = value.x + 'px';
                element.style.top = value.y + 'px';
            } else if (property === 'size') {
                media.size = value;
                element.style.width = value.width + 'px';
                element.style.height = value.height + 'px';
            } else if (property === 'opacity') {
                media.opacity = value;
                element.style.opacity = value;
            } else if (property === 'volume') {
                media.volume = value;
                const video = element.querySelector('video');
                if (video) {
                    video.volume = Math.max(0, Math.min(1, value));
                }
            } else if (property === 'z_index') {
                media.z_index = value;
                element.style.zIndex = value;
            } else {
                // Para otras propiedades, reaplica todos los estilos
                media[property] = value;
                this.applyStyles(element, media);
            }

            console.log('✅ OBS Output propiedad actualizada:', mediaId, property, value);
        } catch (error) {
            console.error('❌ OBS Output error actualizando propiedad:', error);
            this.handleError(error, 'Update Property');
        }
    }

    syncState(state) {
        try {
            console.log('🔄 OBS Output sincronizando estado completo...');
            
            // Limpiar estado actual SIN animación
            this.container.innerHTML = '';
            this.activeMedia.clear();

            // Agregar elementos del estado sincronizado
            if (state && state.items) {
                const items = Object.values(state.items);
                console.log(`📊 OBS Output procesando ${items.length} elementos del estado`);
                
                items.forEach(media => {
                    console.log(`🔄 Sincronizando elemento: ${media.filename || media.id}`);
                    this.addMedia(media);
                });
            }

            this.updateDebugCount();
            const count = this.activeMedia.size;
            console.log(`✅ OBS Output estado sincronizado: ${count} elementos activos`);
        } catch (error) {
            console.error('❌ OBS Output error sincronizando estado:', error);
            this.handleError(error, 'Sync State');
        }
    }

    clearAll() {
        try {
            console.log('🧹 OBS Output limpiando todos los elementos...');
            
            // Animar salida de todos los elementos
            this.activeMedia.forEach((mediaData) => {
                const { element } = mediaData;
                element.style.opacity = '0';
                element.style.transform = 'scale(0.9)';
            });

            // Limpiar después de la animación
            setTimeout(() => {
                this.container.innerHTML = '';
                this.activeMedia.clear();
                this.updateDebugCount();
                console.log('✅ OBS Output todos los elementos eliminados');
            }, 300);

        } catch (error) {
            console.error('❌ OBS Output error limpiando elementos:', error);
            this.handleError(error, 'Clear All');
        }
    }

    // Debug Methods
    setupDebug() {
        // Configurar debug info
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            // Mostrar/ocultar debug con query parameter
            const urlParams = new URLSearchParams(window.location.search);
            this.debugMode = urlParams.get('debug') === 'true';
            debugInfo.style.display = this.debugMode ? 'block' : 'none';
        }
        
        // API de debug global mejorada
        window.debugOBS = {
            getState: () => Object.fromEntries(this.activeMedia),
            getElements: () => Array.from(this.container.children),
            showDebug: () => {
                const debugInfo = document.getElementById('debugInfo');
                if (debugInfo) debugInfo.style.display = 'block';
                this.debugMode = true;
            },
            hideDebug: () => {
                const debugInfo = document.getElementById('debugInfo');
                if (debugInfo) debugInfo.style.display = 'none';
                this.debugMode = false;
            },
            toggleDebug: () => {
                this.debugMode = !this.debugMode;
                const debugInfo = document.getElementById('debugInfo');
                if (debugInfo) debugInfo.style.display = this.debugMode ? 'block' : 'none';
            },
            clear: () => this.clearAll(),
            count: () => this.activeMedia.size,
            reconnect: () => this.connectWebSocket(),
            sync: () => this.requestStateSync(),
            forceReload: () => {
                this.clearAll();
                setTimeout(() => this.requestStateSync(), 500);
            }
        };
        
        console.log('🔧 Debug API disponible: window.debugOBS');
    }

    updateDebugStatus(status) {
        const debugStatus = document.getElementById('debugStatus');
        if (debugStatus) {
            debugStatus.textContent = status;
        }
    }

    updateDebugCount() {
        const debugCount = document.getElementById('debugCount');
        if (debugCount) {
            debugCount.textContent = this.activeMedia.size;
        }
    }

    // Auto-recovery mejorado
    setupAutoRecovery() {
        // Verificar conexión cada 15 segundos (más frecuente)
        setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.log('🔄 OBS Output conexión perdida, intentando reconectar...');
                this.connectWebSocket();
            } else {
                // Si está conectado pero no tenemos elementos, solicitar sincronización
                if (this.activeMedia.size === 0) {
                    console.log('🔄 OBS Output sin elementos, solicitando sincronización...');
                    this.requestStateSync();
                }
            }
        }, 15000);

        // Monitorear elementos cada 5 segundos
        setInterval(() => {
            this.activeMedia.forEach((mediaData, mediaId) => {
                const { element, media } = mediaData;
                
                // Verificar si el elemento sigue en el DOM
                if (!document.contains(element)) {
                    console.warn('⚠️ OBS Output elemento perdido del DOM, recreando:', mediaId);
                    this.activeMedia.delete(mediaId);
                    setTimeout(() => this.addMedia(media), 100);
                }
                
                // Verificar videos pausados
                if (media.type === 'video') {
                    const video = element.querySelector('video');
                    if (video && video.paused && !video.ended) {
                        console.log('🔄 OBS Output reiniciando video pausado:', media.filename || mediaId);
                        video.play().catch(e => {
                            console.error('❌ OBS Output error reiniciando video:', e);
                        });
                    }
                }
            });
        }, 5000);
    }

    // Error Handling
    handleError(error, context = 'Unknown') {
        console.error(`❌ OBS Output error [${context}]:`, error);
        
        if (this.debugMode) {
            this.showErrorNotification(error, context);
        }
    }

    showErrorNotification(error, context) {
        const errorElement = document.createElement('div');
        errorElement.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 10px;
            border-radius: 4px;
            z-index: 9999;
            font-family: monospace;
            font-size: 12px;
            max-width: 300px;
        `;
        errorElement.textContent = `Error [${context}]: ${error.message}`;
        
        document.body.appendChild(errorElement);
        
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 5000);
    }

    // Public API Methods
    getActiveMedia() {
        return Array.from(this.activeMedia.values()).map(data => data.media);
    }

    getMediaById(mediaId) {
        const mediaData = this.activeMedia.get(mediaId);
        return mediaData ? mediaData.media : null;
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    // Cleanup
    destroy() {
        // Limpiar elementos
        this.clearAll();
        
        // Desconectar WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Limpiar referencias
        this.container = null;
        this.activeMedia.clear();
        
        // Limpiar debug API
        if (window.debugOBS) {
            delete window.debugOBS;
        }
        
        this.isInitialized = false;
        console.log('🗑️ OBS Output destruido');
    }
}

// Crear instancia global
const obsOutput = new OBSOutput();

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => obsOutput.init());
} else {
    obsOutput.init();
}

// Prevenir errores no manejados
window.addEventListener('error', (event) => {
    if (obsOutput) {
        obsOutput.handleError(event.error, 'Global Error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    if (obsOutput) {
        obsOutput.handleError(new Error(event.reason), 'Unhandled Promise');
    }
});

// Exportar para uso como módulo si es necesario
if (typeof module !== 'undefined' && module.exports) {
    module.exports = obsOutput;
}