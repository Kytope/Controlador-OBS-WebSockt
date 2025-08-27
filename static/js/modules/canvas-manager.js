// static/js/modules/canvas-manager.js

class CanvasManager {
    constructor(canvasElement, config = {}) {
        this.canvas = canvasElement;
        this.config = {
            scale: 0.6,
            width: 1920,
            height: 1080,
            updateThrottleMs: 16,
            ...config
        };
        
        this.scaledWidth = this.config.width * this.config.scale;
        this.scaledHeight = this.config.height * this.config.scale;
        
        this.elements = new Map();
        this.selectedElement = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragState = {};
        this.resizeState = {};
        
        this.updateThrottles = new Map();
        this.lastUpdateTime = 0;
        this.lastDragUpdateTime = 0; // NUEVO: Para throttling del drag
        this.lastResizeUpdateTime = 0; // NUEVO: Para throttling del resize
        
        this.eventListeners = {
            elementSelect: [],
            elementUpdate: [],
            elementMove: [],
            elementResize: [],
            elementDragging: [], // NUEVO: Evento para drag continuo
            elementResizing: [], // NUEVO: Evento para resize continuo
            elementDelete: [],
            elementAdd: [],
            elementRemove: [],
            canvasDrop: []
        };
        
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        this.canvas.style.width = this.scaledWidth + 'px';
        this.canvas.style.height = this.scaledHeight + 'px';
        this.canvas.style.position = 'relative';
        this.canvas.style.overflow = 'visible';
    }

    setupEventListeners() {
        // Eventos globales
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Eventos del canvas
        this.canvas.addEventListener('dragover', this.handleDragOver.bind(this));
        this.canvas.addEventListener('drop', this.handleDrop.bind(this));
        
        // Click para deseleccionar
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.target === this.canvas) {
                this.deselectAll();
            }
        });
        
        // Teclas de acceso rápido
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    // Gestión de elementos
    addElement(media) {
        if (this.elements.has(media.id)) {
            // Si ya existe, actualizar en lugar de duplicar
            console.log('🔄 Canvas: Elemento ya existe, actualizando:', media.filename || media.id);
            this.updateElement(media);
            return this.elements.get(media.id).element;
        }

        const element = this.createElement(media);
        this.canvas.appendChild(element);
        this.elements.set(media.id, { media, element });
        
        console.log('✅ Canvas: Elemento agregado:', media.filename || media.id);
        this.emit('elementAdd', media);
        return element;
    }

    createElement(media) {
        const div = document.createElement('div');
        div.id = `media-${media.id}`;
        div.className = 'media-element';
        div.dataset.mediaId = media.id;
        div.dataset.type = media.type;
        
        this.applyElementStyles(div, media);
        this.createElementContent(div, media);
        this.createResizeHandles(div);
        this.setupElementEvents(div);
        
        return div;
    }

    applyElementStyles(element, media) {
        const scaledX = media.position.x * this.config.scale;
        const scaledY = media.position.y * this.config.scale;
        const scaledWidth = media.size.width * this.config.scale;
        const scaledHeight = media.size.height * this.config.scale;
        
        Object.assign(element.style, {
            position: 'absolute',
            left: scaledX + 'px',
            top: scaledY + 'px',
            width: scaledWidth + 'px',
            height: scaledHeight + 'px',
            opacity: media.opacity,
            zIndex: media.z_index || 0,
            cursor: 'move',
            userSelect: 'none',
            border: '2px solid transparent',
            transition: 'border-color 0.2s, box-shadow 0.2s'
        });
        
        // Verificar si está fuera del canvas
        const isOutside = this.isElementOutsideCanvas(media);
        element.classList.toggle('outside-canvas', isOutside);
    }

    createElementContent(element, media) {
        if (media.type === 'image') {
            element.innerHTML = `<img src="${media.url}" draggable="false" style="width:100%;height:100%;object-fit:contain;">`;
        } else if (media.type === 'video') {
            const video = document.createElement('video');
            video.src = media.url;
            video.autoplay = false;
            video.loop = true;
            video.muted = false;
            video.volume = media.volume || 1;
            video.controls = false;
            video.preload = 'metadata';
            video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
            element.appendChild(video);
            
            // Crear controles personalizados de video
            this.createVideoControls(element, video);
        } else if (media.type === 'text') {
            this.createTextElement(element, media);
        }
    }

    createVideoControls(element, video) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'video-controls';
        controlsDiv.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 10;
            display: flex;
            gap: 5px;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        
        // Botón play/pause
        const playPauseBtn = document.createElement('button');
        playPauseBtn.innerHTML = '▶️';
        playPauseBtn.style.cssText = `
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            border-radius: 3px;
            padding: 5px 8px;
            cursor: pointer;
            font-size: 12px;
        `;
        
        playPauseBtn.onclick = (e) => {
            e.stopPropagation();
            if (video.paused) {
                video.play();
                playPauseBtn.innerHTML = '⏸️';
            } else {
                video.pause();
                playPauseBtn.innerHTML = '▶️';
            }
        };
        
        controlsDiv.appendChild(playPauseBtn);
        element.appendChild(controlsDiv);
        
        // Mostrar controles al hacer hover
        element.addEventListener('mouseenter', () => {
            controlsDiv.style.opacity = '1';
        });
        
        element.addEventListener('mouseleave', () => {
            controlsDiv.style.opacity = '0';
        });
        
        // Actualizar botón según el estado del video
        video.addEventListener('play', () => {
            playPauseBtn.innerHTML = '⏸️';
        });
        
        video.addEventListener('pause', () => {
            playPauseBtn.innerHTML = '▶️';
        });
    }

    createTextElement(element, media) {
        const textDiv = document.createElement('div');
        textDiv.className = 'text-content';
        textDiv.textContent = media.text_content || 'Texto de ejemplo';
        
        // Aplicar estilos de texto
        const textStyle = {
            fontFamily: media.font_family || 'Arial',
            fontSize: `${media.font_size || 48}px`,
            fontWeight: media.font_weight || 'normal',
            fontStyle: media.font_style || 'normal',
            textAlign: media.text_align || 'left',
            color: media.text_color || '#ffffff',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: media.text_align === 'center' ? 'center' : 
                           media.text_align === 'right' ? 'flex-end' : 'flex-start',
            padding: `${media.padding?.top || 10}px ${media.padding?.right || 10}px ${media.padding?.bottom || 10}px ${media.padding?.left || 10}px`,
            boxSizing: 'border-box',
            wordWrap: 'break-word',
            overflow: 'hidden'
        };
        
        // Añadir sombra de texto si está habilitada
        if (media.text_shadow) {
            textStyle.textShadow = `${media.text_shadow_offset?.x || 1}px ${media.text_shadow_offset?.y || 1}px ${media.text_shadow_blur || 2}px ${media.text_shadow_color || '#000000'}`;
        }
        
        // Color de fondo opcional
        if (media.background_color) {
            textStyle.backgroundColor = media.background_color;
            textStyle.borderRadius = '4px';
        }
        
        Object.assign(textDiv.style, textStyle);
        element.appendChild(textDiv);
    }

    createResizeHandles(element) {
        ['nw', 'ne', 'sw', 'se'].forEach(handle => {
            const handleDiv = document.createElement('div');
            handleDiv.className = `resize-handle ${handle}`;
            handleDiv.dataset.handle = handle;
            handleDiv.style.cssText = `
                position: absolute;
                width: 12px;
                height: 12px;
                background-color: #007bff;
                border: 2px solid #fff;
                border-radius: 2px;
                display: none;
                cursor: ${handle}-resize;
            `;
            
            // Posicionar handles
            const positions = {
                'nw': 'top: -6px; left: -6px;',
                'ne': 'top: -6px; right: -6px;',
                'sw': 'bottom: -6px; left: -6px;',
                'se': 'bottom: -6px; right: -6px;'
            };
            handleDiv.style.cssText += positions[handle];
            
            element.appendChild(handleDiv);
        });
    }

    setupElementEvents(element) {
        element.addEventListener('mousedown', this.handleElementMouseDown.bind(this));
    }

    updateElement(media) {
        const elementData = this.elements.get(media.id);
        if (!elementData) {
            // Si no existe, agregarlo
            console.log('⚠️ Canvas: Elemento no existe, agregando:', media.filename || media.id);
            this.addElement(media);
            return;
        }
        
        const { element } = elementData;
        elementData.media = media;
        
        // Actualizar estilos sin emitir eventos
        this.applyElementStyles(element, media);
        
        // Actualizar volumen si es video
        if (media.type === 'video') {
            const video = element.querySelector('video');
            if (video && media.volume !== undefined) {
                video.volume = media.volume;
            }
        }
        
        // Actualizar contenido si es texto
        if (media.type === 'text') {
            const textContent = element.querySelector('.text-content');
            if (textContent) {
                // Recrear el elemento de texto con nuevos estilos
                element.removeChild(textContent);
                this.createTextElement(element, media);
            }
        }
        
        console.log('✅ Canvas: Elemento actualizado:', media.filename || media.id);
        // NO emitir evento para evitar loops: this.emit('elementUpdate', media);
    }

    removeElement(mediaId) {
        const elementData = this.elements.get(mediaId);
        if (!elementData) {
            console.warn('⚠️ Canvas: Intento de eliminar elemento que no existe:', mediaId);
            return;
        }
        
        const { element } = elementData;
        element.style.opacity = '0';
        
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            this.elements.delete(mediaId);
            
            if (this.selectedElement === element) {
                this.selectedElement = null;
            }
            
            console.log('✅ Canvas: Elemento eliminado:', mediaId);
        }, 300);
        
        this.emit('elementRemove', mediaId);
    }

    clearElements() {
        console.log('🧹 Canvas: Limpiando todos los elementos...');
        
        // Limpiar sin animación para sincronización rápida
        this.canvas.innerHTML = '';
        this.elements.clear();
        this.selectedElement = null;
        
        console.log('✅ Canvas: Todos los elementos eliminados');
    }

    // Selección y manipulación
    selectElement(mediaId) {
        this.deselectAll();
        
        const elementData = this.elements.get(mediaId);
        if (!elementData) return;
        
        const { element, media } = elementData;
        element.classList.add('selected');
        element.style.borderColor = '#007bff';
        element.style.boxShadow = '0 0 10px rgba(0, 123, 255, 0.5)';
        element.style.zIndex = '1000';
        
        // Mostrar handles de resize
        element.querySelectorAll('.resize-handle').forEach(handle => {
            handle.style.display = 'block';
        });
        
        this.selectedElement = element;
        this.emit('elementSelect', media);
    }

    deselectAll() {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('selected');
            this.selectedElement.style.borderColor = 'transparent';
            this.selectedElement.style.boxShadow = 'none';
            this.selectedElement.style.zIndex = this.elements.get(this.selectedElement.dataset.mediaId)?.media.z_index || 0;
            
            // Ocultar handles
            this.selectedElement.querySelectorAll('.resize-handle').forEach(handle => {
                handle.style.display = 'none';
            });
            
            this.selectedElement = null;
        }
    }
    
    selectElementSilent(mediaId) {
        this.deselectAllSilent();
        
        const elementData = this.elements.get(mediaId);
        if (!elementData) return;
        
        const { element, media } = elementData;
        element.classList.add('selected');
        element.style.borderColor = '#007bff';
        element.style.boxShadow = '0 0 10px rgba(0, 123, 255, 0.5)';
        element.style.zIndex = '1000';
        
        element.querySelectorAll('.resize-handle').forEach(handle => {
            handle.style.display = 'block';
        });
        
        this.selectedElement = element;
        // NO emitir: this.emit('elementSelect', media);
    }

    deselectAllSilent() {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('selected');
            this.selectedElement.style.borderColor = 'transparent';
            this.selectedElement.style.boxShadow = 'none';
            this.selectedElement.style.zIndex = this.elements.get(this.selectedElement.dataset.mediaId)?.media.z_index || 0;
            
            this.selectedElement.querySelectorAll('.resize-handle').forEach(handle => {
                handle.style.display = 'none';
            });
            
            this.selectedElement = null;
        }
    }    

    // Event handlers
    handleElementMouseDown(e) {
        const element = e.currentTarget;
        const mediaId = element.dataset.mediaId;
        
        // Si es un handle de resize
        if (e.target.classList.contains('resize-handle')) {
            this.startResize(e);
            return;
        }
        
        e.preventDefault();
        this.selectElement(mediaId);
        this.startDrag(e);
    }

    startDrag(e) {
        if (!this.selectedElement) return;
        
        this.isDragging = true;
        this.selectedElement.classList.add('dragging');
        
        const rect = this.selectedElement.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        
        this.dragState = {
            startX: e.clientX,
            startY: e.clientY,
            elementStartX: rect.left - canvasRect.left,
            elementStartY: rect.top - canvasRect.top
        };
    }

    startResize(e) {
        e.stopPropagation();
        e.preventDefault();
        
        if (!this.selectedElement) return;
        
        this.isResizing = true;
        const handle = e.target.dataset.handle;
        
        this.resizeState = {
            handle,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startWidth: parseFloat(this.selectedElement.style.width),
            startHeight: parseFloat(this.selectedElement.style.height),
            startX: parseFloat(this.selectedElement.style.left),
            startY: parseFloat(this.selectedElement.style.top)
        };
    }

    handleMouseMove(e) {
        if (this.isDragging && this.selectedElement) {
            this.handleDrag(e);
        } else if (this.isResizing && this.selectedElement) {
            this.handleResize(e);
        }
    }

    handleDrag(e) {
        const deltaX = e.clientX - this.dragState.startX;
        const deltaY = e.clientY - this.dragState.startY;
        
        const newX = this.dragState.elementStartX + deltaX;
        const newY = this.dragState.elementStartY + deltaY;
        
        this.selectedElement.style.left = newX + 'px';
        this.selectedElement.style.top = newY + 'px';
        
        // Convertir a coordenadas reales
        const realX = newX / this.config.scale;
        const realY = newY / this.config.scale;
        
        // Emitir evento de actualización en tiempo real (throttled)
        this.throttledUpdate('position', { x: realX, y: realY });
        
        // NUEVO: Emitir evento específico para drag continuo
        this.throttledDragUpdate(realX, realY);
    }
    
    // NUEVO: Método para actualización continua durante drag
    throttledDragUpdate(x, y) {
        const now = Date.now();
        
        // Limitar a 30 FPS (33ms entre actualizaciones)
        if (now - this.lastDragUpdateTime < 33) {
            return;
        }
        
        this.lastDragUpdateTime = now;
        
        // Emitir evento de drag continuo
        this.emit('elementDragging', {
            id: this.selectedElement.dataset.mediaId,
            position: { x, y }
        });
    }

    handleResize(e) {
        const { handle, startMouseX, startMouseY, startWidth, startHeight, startX, startY } = this.resizeState;
        
        const deltaX = e.clientX - startMouseX;
        const deltaY = e.clientY - startMouseY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newX = startX;
        let newY = startY;
        
        switch(handle) {
            case 'se':
                newWidth = Math.max(20, startWidth + deltaX);
                newHeight = Math.max(20, startHeight + deltaY);
                break;
            case 'sw':
                newWidth = Math.max(20, startWidth - deltaX);
                newHeight = Math.max(20, startHeight + deltaY);
                newX = startX + deltaX;
                break;
            case 'ne':
                newWidth = Math.max(20, startWidth + deltaX);
                newHeight = Math.max(20, startHeight - deltaY);
                newY = startY + deltaY;
                break;
            case 'nw':
                newWidth = Math.max(20, startWidth - deltaX);
                newHeight = Math.max(20, startHeight - deltaY);
                newX = startX + deltaX;
                newY = startY + deltaY;
                break;
        }
        
        this.selectedElement.style.width = newWidth + 'px';
        this.selectedElement.style.height = newHeight + 'px';
        this.selectedElement.style.left = newX + 'px';
        this.selectedElement.style.top = newY + 'px';
        
        // Convertir a coordenadas reales
        const realWidth = newWidth / this.config.scale;
        const realHeight = newHeight / this.config.scale;
        const realX = newX / this.config.scale;
        const realY = newY / this.config.scale;
        
        // Emitir eventos throttled
        this.throttledUpdate('size', { width: realWidth, height: realHeight });
        this.throttledUpdate('position', { x: realX, y: realY });
        
        // NUEVO: Emitir evento de resize continuo
        this.throttledResizeUpdate({
            size: { width: realWidth, height: realHeight },
            position: { x: realX, y: realY }
        });
    }
    
    // NUEVO: Método para actualización continua durante resize
    throttledResizeUpdate(data) {
        const now = Date.now();
        
        // Limitar a 30 FPS
        if (now - this.lastResizeUpdateTime < 33) {
            return;
        }
        
        this.lastResizeUpdateTime = now;
        
        this.emit('elementResizing', {
            id: this.selectedElement.dataset.mediaId,
            ...data
        });
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            if (this.selectedElement) {
                this.selectedElement.classList.remove('dragging');
                
                // Enviar actualización final
                const realX = parseFloat(this.selectedElement.style.left) / this.config.scale;
                const realY = parseFloat(this.selectedElement.style.top) / this.config.scale;
                this.emit('elementMove', { 
                    id: this.selectedElement.dataset.mediaId, 
                    position: { x: realX, y: realY } 
                });
            }
        }
        
        if (this.isResizing) {
            this.isResizing = false;
            
            if (this.selectedElement) {
                const realWidth = parseFloat(this.selectedElement.style.width) / this.config.scale;
                const realHeight = parseFloat(this.selectedElement.style.height) / this.config.scale;
                const realX = parseFloat(this.selectedElement.style.left) / this.config.scale;
                const realY = parseFloat(this.selectedElement.style.top) / this.config.scale;
                
                this.emit('elementResize', {
                    id: this.selectedElement.dataset.mediaId,
                    size: { width: realWidth, height: realHeight },
                    position: { x: realX, y: realY }
                });
            }
        }
    }

    handleKeyDown(e) {
        if (!this.selectedElement) return;
        
        const mediaId = this.selectedElement.dataset.mediaId;
        
        if (e.key === 'Delete') {
            e.preventDefault();
            this.emit('elementDelete', mediaId);
        } else if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            const step = e.shiftKey ? 50 : 10;
            let deltaX = 0, deltaY = 0;
            
            switch(e.key) {
                case 'ArrowLeft': deltaX = -step; break;
                case 'ArrowRight': deltaX = step; break;
                case 'ArrowUp': deltaY = -step; break;
                case 'ArrowDown': deltaY = step; break;
            }
            
            this.moveElementBy(mediaId, deltaX, deltaY);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.canvas.classList.add('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.canvas.classList.remove('drag-over');
        
        // Calcular posición del drop
        const canvasRect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - canvasRect.left) / this.config.scale;
        const y = (e.clientY - canvasRect.top) / this.config.scale;
        
        this.emit('canvasDrop', { x, y, event: e });
    }

    // Utilidades
    throttledUpdate(property, value) {
        const now = Date.now();
        
        if (now - this.lastUpdateTime < this.config.updateThrottleMs) {
            if (this.updateThrottles.has(property)) {
                clearTimeout(this.updateThrottles.get(property));
            }
            
            const timeout = setTimeout(() => {
                this.emit('elementUpdate', {
                    id: this.selectedElement?.dataset.mediaId,
                    property,
                    value
                });
                this.updateThrottles.delete(property);
            }, this.config.updateThrottleMs);
            
            this.updateThrottles.set(property, timeout);
            return;
        }
        
        this.lastUpdateTime = now;
        this.emit('elementUpdate', {
            id: this.selectedElement?.dataset.mediaId,
            property,
            value
        });
    }

    moveElementBy(mediaId, deltaX, deltaY) {
        const elementData = this.elements.get(mediaId);
        if (!elementData) return;
        
        const { element, media } = elementData;
        const newX = media.position.x + (deltaX / this.config.scale);
        const newY = media.position.y + (deltaY / this.config.scale);
        
        element.style.left = (newX * this.config.scale) + 'px';
        element.style.top = (newY * this.config.scale) + 'px';
        
        this.emit('elementMove', {
            id: mediaId,
            position: { x: newX, y: newY }
        });
    }

    isElementOutsideCanvas(media) {
        return media.position.x < 0 || 
               media.position.x + media.size.width > this.config.width ||
               media.position.y < 0 || 
               media.position.y + media.size.height > this.config.height;
    }

    getSelectedMediaId() {
        return this.selectedElement?.dataset.mediaId || null;
    }

    // Event system
    on(event, listener) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(listener);
        }
    }

    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error en listener del evento ${event}:`, error);
                }
            });
        }
    }

    // API pública
    getElement(mediaId) {
        return this.elements.get(mediaId);
    }

    getAllElements() {
        return Array.from(this.elements.values());
    }

    getCanvasSize() {
        return {
            width: this.config.width,
            height: this.config.height,
            scaledWidth: this.scaledWidth,
            scaledHeight: this.scaledHeight,
            scale: this.config.scale
        };
    }

    destroy() {
        // Limpiar event listeners
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('keydown', this.handleKeyDown);
        
        // Limpiar timeouts
        this.updateThrottles.forEach(timeout => clearTimeout(timeout));
        this.updateThrottles.clear();
        
        // Limpiar elementos
        this.clearElements();
    }
}

export default CanvasManager;