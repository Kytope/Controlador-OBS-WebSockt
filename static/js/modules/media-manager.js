// static/js/modules/media-manager.js

class MediaManager {
    constructor() {
        this.mediaLibrary = {};
        this.activeMedia = {};
        this.uploadListeners = [];
        this.libraryUpdateListeners = [];
    }

    // Gestión de biblioteca de medios
    async scanMedia() {
        try {
            const response = await fetch('/api/media/scan');
            const data = await response.json();
            
            const allMediaResponse = await fetch('/api/media');
            const allMediaData = await allMediaResponse.json();
            
            this.mediaLibrary = {};
            
            // Verificar que items existe y es un array
            if (allMediaData.items && Array.isArray(allMediaData.items)) {
                allMediaData.items.forEach(item => {
                    this.mediaLibrary[item.id] = item;
                });
            }
            
            this.notifyLibraryUpdate();
            return this.mediaLibrary;
        } catch (error) {
            console.error('Error al escanear medios:', error);
            throw error;
        }
    }

    async uploadFile(file, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/media/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Actualizar biblioteca local
            this.mediaLibrary[data.id] = data.item;
            this.notifyLibraryUpdate();
            this.notifyUploadComplete(data);
            
            return data;
        } catch (error) {
            console.error('Error al subir archivo:', error);
            this.notifyUploadError(error);
            throw error;
        }
    }

    async uploadFiles(files) {
        const results = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const result = await this.uploadFile(file);
                results.push({ success: true, file: file.name, data: result });
            } catch (error) {
                results.push({ success: false, file: file.name, error: error.message });
            }
        }
        
        return results;
    }

    async deleteMedia(mediaId) {
        try {
            const response = await fetch(`/api/media/${mediaId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.status === 'deleted') {
                delete this.mediaLibrary[mediaId];
                delete this.activeMedia[mediaId];
                this.notifyLibraryUpdate();
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error al eliminar media:', error);
            throw error;
        }
    }

    // Gestión de medios activos
    addActiveMedia(media) {
        this.activeMedia[media.id] = { ...media };
    }

    updateActiveMedia(mediaId, property, value) {
        if (this.activeMedia[mediaId]) {
            if (typeof property === 'object') {
                // Actualización completa
                Object.assign(this.activeMedia[mediaId], property);
            } else {
                // Actualización de propiedad específica
                this.activeMedia[mediaId][property] = value;
            }
        }
    }

    removeActiveMedia(mediaId) {
        delete this.activeMedia[mediaId];
    }

    clearActiveMedia() {
        this.activeMedia = {};
    }

    getActiveMedia() {
        return { ...this.activeMedia };
    }

    getMediaLibrary() {
        return { ...this.mediaLibrary };
    }

    getMediaById(mediaId) {
        return this.mediaLibrary[mediaId] || this.activeMedia[mediaId];
    }

    // Validación de archivos
    validateFile(file) {
        const maxSize = 100 * 1024 * 1024; // 100MB
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg'
        ];

        if (file.size > maxSize) {
            throw new Error(`El archivo ${file.name} es demasiado grande (máximo 100MB)`);
        }

        if (!allowedTypes.includes(file.type)) {
            throw new Error(`Tipo de archivo no soportado: ${file.type}`);
        }

        return true;
    }

    validateFiles(files) {
        const errors = [];
        
        for (const file of files) {
            try {
                this.validateFile(file);
            } catch (error) {
                errors.push(error.message);
            }
        }
        
        return errors;
    }

    // Crear elemento de texto
    createTextElement(textContent, options = {}) {
        const textId = 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const textItem = {
            id: textId,
            type: 'text',
            filename: `texto_${textId}`,
            url: '',
            text_content: textContent,
            position: options.position || { x: 100, y: 100 },
            size: options.size || { width: 300, height: 100 },
            opacity: options.opacity || 1.0,
            visible: true,
            z_index: options.z_index || 0,
            // Propiedades de texto
            font_family: options.font_family || 'Arial',
            font_size: options.font_size || 48,
            font_weight: options.font_weight || 'normal',
            font_style: options.font_style || 'normal',
            text_align: options.text_align || 'left',
            text_color: options.text_color || '#ffffff',
            text_shadow: options.text_shadow || false,
            text_shadow_color: options.text_shadow_color || '#000000',
            text_shadow_blur: options.text_shadow_blur || 2,
            text_shadow_offset: options.text_shadow_offset || { x: 1, y: 1 },
            background_color: options.background_color || null,
            padding: options.padding || { top: 10, right: 10, bottom: 10, left: 10 }
        };
        
        return textItem;
    }

    // Funciones para drag & drop
    createDragData(media) {
        return JSON.stringify({
            type: 'media-item',
            mediaId: media.id,
            mediaType: media.type,
            filename: media.filename,
            url: media.url
        });
    }

    parseDragData(dataTransfer) {
        try {
            const data = dataTransfer.getData('text/plain');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    // Utilidades
    isImage(media) {
        return media.type === 'image';
    }

    isVideo(media) {
        return media.type === 'video';
    }

    isText(media) {
        return media.type === 'text';
    }

    getMediaType(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const videoExts = ['mp4', 'webm', 'ogg'];
        
        if (imageExts.includes(ext)) return 'image';
        if (videoExts.includes(ext)) return 'video';
        return 'unknown';
    }

    // Event listeners
    onLibraryUpdate(listener) {
        this.libraryUpdateListeners.push(listener);
    }

    onUploadComplete(listener) {
        this.uploadListeners.push(listener);
    }

    notifyLibraryUpdate() {
        this.libraryUpdateListeners.forEach(listener => {
            try {
                listener(this.mediaLibrary);
            } catch (error) {
                console.error('Error en listener de actualización de biblioteca:', error);
            }
        });
    }

    notifyUploadComplete(data) {
        this.uploadListeners.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error('Error en listener de upload completo:', error);
            }
        });
    }

    notifyUploadError(error) {
        console.error('Error de upload:', error);
        // Aquí podrías emitir un evento personalizado o usar un sistema de notificaciones
    }

    async deleteFromLibrary(filename) {
        try {
            const response = await fetch(`/api/media/library/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'deleted') {
                // Buscar y remover elementos por filename de biblioteca local
                const itemsToDelete = [];
                for (const [id, media] of Object.entries(this.mediaLibrary)) {
                    if (media.filename === filename) {
                        itemsToDelete.push(id);
                    }
                }
                
                itemsToDelete.forEach(id => {
                    delete this.mediaLibrary[id];
                    // También remover de activos si existe
                    delete this.activeMedia[id];
                });
                
                this.notifyLibraryUpdate();
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error al eliminar de biblioteca:', error);
            throw error;
        }
    }
}

export default MediaManager;