class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectDelay = 2000;
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
        this.connectionListeners = [];
        this.messageHandlers = {};
        this.isConnecting = false;
        
        // Estado versionado
        this.stateVersion = 0;
        this.stateChecksum = '';
        
        // Cola de operaciones pendientes
        this.pendingOperations = new Map();
        this.operationTimeout = 3000; // 3 segundos
        this.retryQueue = [];
        this.maxRetries = 3;
        
        // Verificación periódica
        this.versionCheckInterval = null;
        this.versionCheckPeriod = 30000; // 30 segundos
    }

    getWebSocketUrl(endpoint) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}${endpoint}`;
    }

    connect(endpoint) {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
            return Promise.resolve();
        }

        this.isConnecting = true;
        
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = this.getWebSocketUrl(endpoint);
                console.log(`🔌 Conectando a WebSocket: ${wsUrl}`);
                
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('✅ WebSocket conectado');
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.notifyConnectionChange(true);
                    
                    // Iniciar verificación periódica de versión
                    this.startVersionCheck();
                    
                    // Procesar cola de reintentos
                    this.processRetryQueue();
                    
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('❌ Error parsing WebSocket message:', error);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('❌ WebSocket error:', error);
                    this.isConnecting = false;
                    this.notifyConnectionChange(false);
                    this.stopVersionCheck();
                    reject(error);
                };
                
                this.ws.onclose = (event) => {
                    console.log('🔌 WebSocket desconectado:', event.code, event.reason);
                    this.isConnecting = false;
                    this.notifyConnectionChange(false);
                    this.stopVersionCheck();
                    
                    // Mover operaciones pendientes a cola de reintentos
                    this.moveOperationsToRetryQueue();
                    
                    this.scheduleReconnect(endpoint);
                };
                
            } catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    scheduleReconnect(endpoint) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Máximo número de intentos de reconexión alcanzado');
            // Notificar fallo de operaciones pendientes
            this.failAllPendingOperations('No se pudo reconectar al servidor');
            return;
        }

        this.reconnectAttempts++;
        console.log(`🔄 Reconectando en ${this.reconnectDelay}ms (intento ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connect(endpoint);
        }, this.reconnectDelay);
    }

    // Envío mejorado con confirmación
    sendWithConfirmation(message, timeout = null) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                // Agregar a cola de reintentos
                this.addToRetryQueue(message, resolve, reject);
                return;
            }

            const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const operationTimeout = timeout || this.operationTimeout;
            
            // Configurar timeout
            const timeoutId = setTimeout(() => {
                const operation = this.pendingOperations.get(requestId);
                if (operation) {
                    this.pendingOperations.delete(requestId);
                    operation.reject(new Error(`Timeout: operación ${message.action} no confirmada`));
                    
                    // Agregar a cola de reintentos
                    if (operation.retries < this.maxRetries) {
                        operation.retries++;
                        this.addToRetryQueue(message, operation.resolve, operation.reject, operation.retries);
                    }
                }
            }, operationTimeout);

            // Registrar operación pendiente
            this.pendingOperations.set(requestId, {
                resolve,
                reject,
                timeoutId,
                message,
                retries: 0
            });

            // Enviar mensaje con request_id
            const messageWithId = {
                ...message,
                request_id: requestId
            };

            try {
                this.ws.send(JSON.stringify(messageWithId));
            } catch (error) {
                clearTimeout(timeoutId);
                this.pendingOperations.delete(requestId);
                reject(error);
            }
        });
    }

    // Envío simple sin confirmación (para compatibilidad)
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                // Agregar request_id si no existe
                if (!message.request_id) {
                    message.request_id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
                
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error('❌ Error enviando mensaje:', error);
                return false;
            }
        } else {
            console.warn('⚠️ WebSocket no está conectado. Mensaje no enviado:', message);
            return false;
        }
    }

    handleMessage(data) {
        // Actualizar versión si viene en el mensaje
        if (data.version !== undefined) {
            this.stateVersion = data.version;
        }
        if (data.checksum !== undefined) {
            this.stateChecksum = data.checksum;
        }

        // Manejar respuestas de operaciones
        if (data.action === 'operation_response' && data.response) {
            this.handleOperationResponse(data.response);
            return;
        }

        // Manejar verificación de versión
        if (data.action === 'version_check') {
            this.handleVersionCheck(data);
            return;
        }

        // Manejar otros mensajes
        const handler = this.messageHandlers[data.action];
        if (handler) {
            handler(data);
        } else {
            console.warn('⚠️ No hay handler para la acción:', data.action);
        }
    }

    handleOperationResponse(response) {
        const operation = this.pendingOperations.get(response.request_id);
        if (!operation) {
            console.warn('⚠️ Respuesta para operación no encontrada:', response.request_id);
            return;
        }

        // Limpiar timeout
        clearTimeout(operation.timeoutId);
        this.pendingOperations.delete(response.request_id);

        // Actualizar versión
        if (response.version !== undefined) {
            this.stateVersion = response.version;
        }
        if (response.checksum !== undefined) {
            this.stateChecksum = response.checksum;
        }

        // Resolver o rechazar promesa
        if (response.success) {
            console.log(`✅ Operación confirmada: ${response.action} v${response.version}`);
            operation.resolve(response);
        } else {
            console.error(`❌ Operación fallida: ${response.action} - ${response.error}`);
            operation.reject(new Error(response.error || 'Operación fallida'));
        }
    }

    handleVersionCheck(data) {
        if (data.needs_sync) {
            console.warn(`⚠️ Desincronización detectada: cliente v${this.stateVersion} vs servidor v${data.server_version}`);
            console.log(`   Checksum cliente: ${this.stateChecksum}`);
            console.log(`   Checksum servidor: ${data.server_checksum}`);
            
            // El servidor debería enviar el estado completo después
        }
    }

    // Verificación periódica de versión
    startVersionCheck() {
        this.stopVersionCheck(); // Limpiar interval anterior si existe
        
        this.versionCheckInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send({
                    action: 'verify_version',
                    client_version: this.stateVersion,
                    client_checksum: this.stateChecksum
                });
            }
        }, this.versionCheckPeriod);
    }

    stopVersionCheck() {
        if (this.versionCheckInterval) {
            clearInterval(this.versionCheckInterval);
            this.versionCheckInterval = null;
        }
    }

    // Gestión de cola de reintentos
    addToRetryQueue(message, resolve, reject, retries = 0) {
        this.retryQueue.push({
            message,
            resolve,
            reject,
            retries,
            timestamp: Date.now()
        });
        
        console.log(`📋 Mensaje agregado a cola de reintentos (${this.retryQueue.length} en cola)`);
    }

    processRetryQueue() {
        if (this.retryQueue.length === 0) return;
        
        console.log(`🔄 Procesando ${this.retryQueue.length} mensajes en cola de reintentos`);
        
        const queue = [...this.retryQueue];
        this.retryQueue = [];
        
        queue.forEach(item => {
            if (item.retries < this.maxRetries) {
                this.sendWithConfirmation(item.message)
                    .then(item.resolve)
                    .catch(item.reject);
            } else {
                item.reject(new Error('Máximo número de reintentos alcanzado'));
            }
        });
    }

    moveOperationsToRetryQueue() {
        this.pendingOperations.forEach((operation, requestId) => {
            clearTimeout(operation.timeoutId);
            
            if (operation.retries < this.maxRetries) {
                this.addToRetryQueue(
                    operation.message,
                    operation.resolve,
                    operation.reject,
                    operation.retries + 1
                );
            } else {
                operation.reject(new Error('Conexión perdida y máximo de reintentos alcanzado'));
            }
        });
        
        this.pendingOperations.clear();
    }

    failAllPendingOperations(reason) {
        this.pendingOperations.forEach(operation => {
            clearTimeout(operation.timeoutId);
            operation.reject(new Error(reason));
        });
        this.pendingOperations.clear();
        
        this.retryQueue.forEach(item => {
            item.reject(new Error(reason));
        });
        this.retryQueue = [];
    }

    // Event handlers
    onMessage(action, handler) {
        this.messageHandlers[action] = handler;
    }

    onConnectionChange(listener) {
        this.connectionListeners.push(listener);
    }

    notifyConnectionChange(connected) {
        this.connectionListeners.forEach(listener => {
            try {
                listener(connected);
            } catch (error) {
                console.error('❌ Error en listener de conexión:', error);
            }
        });
    }

    // Estado y utilidades
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    getStateVersion() {
        return this.stateVersion;
    }

    getStateChecksum() {
        return this.stateChecksum;
    }

    updateStateVersion(version, checksum) {
        this.stateVersion = version;
        this.stateChecksum = checksum;
    }

    disconnect() {
        this.stopVersionCheck();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.failAllPendingOperations('Desconexión manual');
    }

    // Métodos de depuración
    getPendingOperationsCount() {
        return this.pendingOperations.size;
    }

    getRetryQueueLength() {
        return this.retryQueue.length;
    }

    getDebugInfo() {
        return {
            connected: this.isConnected(),
            version: this.stateVersion,
            checksum: this.stateChecksum,
            pendingOperations: this.pendingOperations.size,
            retryQueue: this.retryQueue.length,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Exportar como singleton
const wsManager = new WebSocketManager();
export default wsManager;