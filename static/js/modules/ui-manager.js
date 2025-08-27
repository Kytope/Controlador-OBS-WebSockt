// static/js/modules/ui-manager.js - CORREGIDO

class UIManager {
    constructor() {
        this.elements = {};
        this.updateListeners = [];
        this.state = {
            selectedMediaId: null,
            isConnected: false,
            mediaLibrary: {},
            activeMedia: {}
        };
    }

    // Inicialización
    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.updateElementCounts(); // Inicializar contadores
        return this;
    }

    cacheElements() {
        // Elementos principales
        this.elements = {
            // Status
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText'),
            connectionStatus: document.getElementById('connectionStatus'),
            connectionText: document.getElementById('connectionText'),
            
            // Media library
            mediaGrid: document.getElementById('mediaGrid'),
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            mediaGridEmpty: document.getElementById('mediaGridEmpty'),
            
            // Active elements
            elementList: document.getElementById('elementList'),
            activeItems: document.getElementById('activeItems'),
            elementListEmpty: document.getElementById('elementListEmpty'),
            
            // Counters
            elementCount: document.getElementById('elementCount'),
            canvasElementCount: document.getElementById('canvasElementCount'),
            
            // Properties panel
            propertiesPanel: document.getElementById('propertiesPanel'),
            selectedInfo: document.getElementById('selectedInfo'),
            opacityControl: document.getElementById('opacityControl'),
            opacityValue: document.getElementById('opacityValue'),
            volumeControl: document.getElementById('volumeControl'),
            volumeValue: document.getElementById('volumeValue'),
            volumeGroup: document.getElementById('volumeGroup'),
            posX: document.getElementById('posX'),
            posY: document.getElementById('posY'),
            sizeWidth: document.getElementById('sizeWidth'),
            sizeHeight: document.getElementById('sizeHeight'),
            
            // Text properties
            textProperties: document.getElementById('textProperties'),
            fontProperties: document.getElementById('fontProperties'),
            textStyleProperties: document.getElementById('textStyleProperties'),
            textShadowProperties: document.getElementById('textShadowProperties'),
            textContent: document.getElementById('textContent'),
            fontFamily: document.getElementById('fontFamily'),
            fontSize: document.getElementById('fontSize'),
            textColor: document.getElementById('textColor'),
            textAlign: document.getElementById('textAlign'),
            fontBold: document.getElementById('fontBold'),
            fontItalic: document.getElementById('fontItalic'),
            textShadowEnabled: document.getElementById('textShadowEnabled'),
            textShadowColor: document.getElementById('textShadowColor'),
            textShadowBlur: document.getElementById('textShadowBlur'),
            shadowControls: document.getElementById('shadowControls'),
            
            // Others
            overlayUrl: document.getElementById('overlayUrl'),
            uploadProgress: document.getElementById('uploadProgress')
        };
    }

    setupEventListeners() {
        // File input
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }
        
        // Property controls con debounce
        this.setupPropertyControls();
    }

    setupPropertyControls() {
        if (this.elements.opacityControl) {
            this.elements.opacityControl.addEventListener('input', 
                this.debounce(this.handleOpacityChange.bind(this), 16));
        }
        
        if (this.elements.volumeControl) {
            this.elements.volumeControl.addEventListener('input', 
                this.debounce(this.handleVolumeChange.bind(this), 16));
        }
        
        if (this.elements.posX) {
            this.elements.posX.addEventListener('input', 
                this.debounce(this.handlePositionChange.bind(this), 100));
        }
        
        if (this.elements.posY) {
            this.elements.posY.addEventListener('input', 
                this.debounce(this.handlePositionChange.bind(this), 100));
        }
        
        if (this.elements.sizeWidth) {
            this.elements.sizeWidth.addEventListener('input', 
                this.debounce(this.handleSizeChange.bind(this), 100));
        }
        
        if (this.elements.sizeHeight) {
            this.elements.sizeHeight.addEventListener('input', 
                this.debounce(this.handleSizeChange.bind(this), 100));
        }
        
        // Text property controls
        this.setupTextPropertyControls();
    }

    setupTextPropertyControls() {
        // Text content
        if (this.elements.textContent) {
            this.elements.textContent.addEventListener('input', 
                this.debounce(this.handleTextContentChange.bind(this), 300));
        }
        
        // Font family
        if (this.elements.fontFamily) {
            this.elements.fontFamily.addEventListener('change', 
                this.handleFontFamilyChange.bind(this));
        }
        
        // Font size
        if (this.elements.fontSize) {
            this.elements.fontSize.addEventListener('input', 
                this.debounce(this.handleFontSizeChange.bind(this), 100));
        }
        
        // Text color
        if (this.elements.textColor) {
            this.elements.textColor.addEventListener('input', 
                this.handleTextColorChange.bind(this));
        }
        
        // Text align
        if (this.elements.textAlign) {
            this.elements.textAlign.addEventListener('change', 
                this.handleTextAlignChange.bind(this));
        }
        
        // Font bold
        if (this.elements.fontBold) {
            this.elements.fontBold.addEventListener('change', 
                this.handleFontBoldChange.bind(this));
        }
        
        // Font italic
        if (this.elements.fontItalic) {
            this.elements.fontItalic.addEventListener('change', 
                this.handleFontItalicChange.bind(this));
        }
        
        // Text shadow enabled
        if (this.elements.textShadowEnabled) {
            this.elements.textShadowEnabled.addEventListener('change', 
                this.handleTextShadowEnabledChange.bind(this));
        }
        
        // Text shadow color
        if (this.elements.textShadowColor) {
            this.elements.textShadowColor.addEventListener('input', 
                this.handleTextShadowColorChange.bind(this));
        }
        
        // Text shadow blur
        if (this.elements.textShadowBlur) {
            this.elements.textShadowBlur.addEventListener('input', 
                this.debounce(this.handleTextShadowBlurChange.bind(this), 100));
        }
    }

    setupDragAndDrop() {
        if (!this.elements.uploadArea) return;
        
        const uploadArea = this.elements.uploadArea;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, this.preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.add('drag-over');
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.remove('drag-over');
            }, false);
        });
        
        uploadArea.addEventListener('drop', this.handleDrop.bind(this), false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Connection status
    updateConnectionStatus(connected) {
        this.state.isConnected = connected;
        
        if (this.elements.statusIndicator && this.elements.statusText) {
            this.elements.statusIndicator.classList.toggle('connected', connected);
            this.elements.statusText.textContent = connected ? 'Conectado' : 'Desconectado';
        }
        
        if (this.elements.connectionStatus && this.elements.connectionText) {
            if (connected) {
                this.elements.connectionStatus.textContent = '🟢';
                this.elements.connectionStatus.classList.add('connected');
                this.elements.connectionText.textContent = 'Conectado';
            } else {
                this.elements.connectionStatus.textContent = '🔴';
                this.elements.connectionStatus.classList.remove('connected');
                this.elements.connectionText.textContent = 'Desconectado';
            }
        }
    }

    // Media library
    updateMediaLibrary(mediaLibrary) {
        this.state.mediaLibrary = mediaLibrary;
        this.renderMediaGrid();
    }

    renderMediaGrid() {
        if (!this.elements.mediaGrid) return;
        
        const mediaCount = Object.keys(this.state.mediaLibrary).length;
        
        if (mediaCount === 0) {
            this.elements.mediaGrid.innerHTML = '';
            if (this.elements.mediaGridEmpty) {
                this.elements.mediaGridEmpty.style.display = 'block';
            }
            return;
        }
        
        if (this.elements.mediaGridEmpty) {
            this.elements.mediaGridEmpty.style.display = 'none';
        }
        
        this.elements.mediaGrid.innerHTML = '';
        
        Object.values(this.state.mediaLibrary).forEach(media => {
            const element = this.createMediaItem(media);
            this.elements.mediaGrid.appendChild(element);
        });
    }

    createMediaItem(media) {
    const div = document.createElement('div');
    div.className = 'media-item';
    div.dataset.mediaId = media.id;
    div.draggable = true;
    
    // Verificar si está activo
    if (this.state.activeMedia[media.id]) {
        div.classList.add('active');
    }
    
    const preview = media.type === 'image' 
        ? `<img src="${media.url}" class="media-preview" alt="${media.filename}">`
        : `<video src="${media.url}" class="media-preview" muted></video>`;
    
    div.innerHTML = `
        ${preview}
        <div class="media-item-info">
            <div class="media-name">${media.filename}</div>
            <div class="media-actions">
                <button class="media-btn media-btn-delete" onclick="deleteMediaFromLibrary('${media.filename}')" title="Eliminar de biblioteca">
                    🗑️
                </button>
            </div>
        </div>
    `;
    
    // Events existentes...
    div.addEventListener('click', (e) => {
        if (!e.target.classList.contains('media-btn')) {
            this.emit('mediaItemClick', media);
        }
    });
    
    div.addEventListener('dragstart', (e) => this.handleMediaDragStart(e, media));
    div.addEventListener('dragend', this.handleMediaDragEnd.bind(this));
    
    return div;
}

    // Active media - CORREGIDO EL CONTEO
    updateActiveMedia(activeMedia) {
        this.state.activeMedia = activeMedia;
        this.renderActiveElements();
        this.updateMediaGridActiveState();
        this.updateElementCounts(); // Actualizar contadores
    }

    // MÉTODO CORREGIDO PARA CONTEO PRECISO
    updateElementCounts() {
        // Contar solo elementos visibles y activos
        const visibleElements = Object.values(this.state.activeMedia).filter(media => media.visible !== false);
        const count = visibleElements.length;
        
        // Actualizar todos los contadores
        if (this.elements.elementCount) {
            this.elements.elementCount.textContent = count;
        }
        
        if (this.elements.canvasElementCount) {
            this.elements.canvasElementCount.textContent = count;
        }
        
        console.log(`Contadores actualizados: ${count} elementos activos`);
    }

    renderActiveElements() {
        const container = this.elements.elementList || this.elements.activeItems;
        if (!container) return;
        
        // Filtrar solo elementos visibles
        const visibleMedia = Object.values(this.state.activeMedia).filter(media => media.visible !== false);
        
        if (visibleMedia.length === 0) {
            container.innerHTML = '';
            if (this.elements.elementListEmpty) {
                this.elements.elementListEmpty.style.display = 'block';
            }
            return;
        }
        
        if (this.elements.elementListEmpty) {
            this.elements.elementListEmpty.style.display = 'none';
        }
        
        container.innerHTML = '';
        
        const sortedMedia = visibleMedia.sort((a, b) => (b.z_index || 0) - (a.z_index || 0));
        
        sortedMedia.forEach(media => {
            const element = this.createActiveElement(media);
            container.appendChild(element);
        });
    }

    createActiveElement(media) {
        const div = document.createElement('div');
        div.className = 'element-item';
        if (this.elements.activeItems) {
            div.className = 'active-item';
        }
        div.dataset.mediaId = media.id;
        
        if (this.state.selectedMediaId === media.id) {
            div.classList.add('selected');
        }
        
        // Check if outside canvas
        const isOutside = this.isElementOutsideCanvas(media);
        if (isOutside) {
            div.classList.add('outside');
        }
        
        let preview;
        if (media.type === 'image') {
            preview = `<img src="${media.url}" class="element-preview active-item-preview" alt="">`;
        } else if (media.type === 'video') {
            preview = `<video src="${media.url}" class="element-preview active-item-preview" muted></video>`;
        } else if (media.type === 'text') {
            preview = `<div class="text-preview" title="${media.text_content}">📝</div>`;
        } else {
            preview = `<div class="unknown-preview">❓</div>`;
        }
        
        if (this.elements.elementList) {
            // Layout para overlay editor
            div.innerHTML = `
                <div class="element-info">
                    ${preview}
                    <span class="element-name">${media.type === 'text' ? (media.text_content || 'Texto') : media.filename}</span>
                    ${isOutside ? '<span class="element-status">(Fuera)</span>' : ''}
                </div>
                <div class="element-controls">
                    <button class="element-btn" onclick="moveLayer('${media.id}', 'up')" title="Subir">↑</button>
                    <button class="element-btn" onclick="moveLayer('${media.id}', 'down')" title="Bajar">↓</button>
                    <button class="element-btn" onclick="toggleVisibility('${media.id}')" title="Ocultar/Mostrar">👁</button>
                    <button class="element-btn delete" onclick="removeMediaById('${media.id}')" title="Eliminar">🗑️</button>
                </div>
            `;
        } else {
            // Layout para control panel
            div.innerHTML = `
                <div class="active-item-info">
                    ${preview}
                    <span class="active-item-name">${media.type === 'text' ? (media.text_content || 'Texto') : media.filename}</span>
                </div>
                <div class="active-item-actions">
                    <button class="icon-btn remove" onclick="removeFromOverlay('${media.id}')">🗑️</button>
                </div>
            `;
        }
        
        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('element-btn') && !e.target.classList.contains('icon-btn')) {
                this.selectMedia(media.id);
            }
        });
        
        return div;
    }

    updateMediaGridActiveState() {
        if (!this.elements.mediaGrid) return;
        
        this.elements.mediaGrid.querySelectorAll('.media-item').forEach(item => {
            const mediaId = item.dataset.mediaId;
            const isActive = this.state.activeMedia[mediaId] && this.state.activeMedia[mediaId].visible !== false;
            item.classList.toggle('active', isActive);
        });
    }

    // Properties panel
    selectMedia(mediaId) {
        this.state.selectedMediaId = mediaId;
        
        // Update visual selection
        document.querySelectorAll('.element-item, .active-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.mediaId === mediaId);
        });
        
        const media = this.state.activeMedia[mediaId];
        if (media) {
            this.showProperties(media);
            this.emit('mediaSelect', media);
        }
    }

    selectMediaSilent(mediaId) {
        this.state.selectedMediaId = mediaId;
        
        document.querySelectorAll('.element-item, .active-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.mediaId === mediaId);
        });
    
        const media = this.state.activeMedia[mediaId];
        if (media) {
            this.showProperties(media);
            // NO emitir evento: this.emit('mediaSelect', media);
        }
    }

    showProperties(media) {
        if (!this.elements.propertiesPanel) return;
        
        this.elements.propertiesPanel.style.display = 'block';
        
        // Actualizar info del elemento seleccionado
        if (this.elements.selectedInfo) {
            const selectedName = this.elements.selectedInfo.querySelector('.selected-name');
            if (selectedName) {
                selectedName.textContent = media.type === 'text' ? (media.text_content || 'Texto') : media.filename;
            }
        }
        
        // Opacity
        if (this.elements.opacityControl && this.elements.opacityValue) {
            this.elements.opacityControl.value = media.opacity * 100;
            this.elements.opacityValue.textContent = Math.round(media.opacity * 100) + '%';
        }
        
        // Volume (solo para videos)
        if (media.type === 'video' && this.elements.volumeGroup) {
            this.elements.volumeGroup.style.display = 'block';
            if (this.elements.volumeControl && this.elements.volumeValue) {
                this.elements.volumeControl.value = media.volume * 100;
                this.elements.volumeValue.textContent = Math.round(media.volume * 100) + '%';
            }
        } else if (this.elements.volumeGroup) {
            this.elements.volumeGroup.style.display = 'none';
        }
        
        // Position
        if (this.elements.posX && this.elements.posY) {
            this.elements.posX.value = Math.round(media.position.x);
            this.elements.posY.value = Math.round(media.position.y);
        }
        
        // Size
        if (this.elements.sizeWidth && this.elements.sizeHeight) {
            this.elements.sizeWidth.value = Math.round(media.size.width);
            this.elements.sizeHeight.value = Math.round(media.size.height);
        }
        
        // Text properties (solo para elementos de texto)
        if (media.type === 'text') {
            this.showTextProperties(media);
        } else {
            this.hideTextProperties();
        }
    }

    showTextProperties(media) {
        // Mostrar paneles de texto
        if (this.elements.textProperties) {
            this.elements.textProperties.style.display = 'block';
        }
        if (this.elements.fontProperties) {
            this.elements.fontProperties.style.display = 'block';
        }
        if (this.elements.textStyleProperties) {
            this.elements.textStyleProperties.style.display = 'block';
        }
        if (this.elements.textShadowProperties) {
            this.elements.textShadowProperties.style.display = 'block';
        }
        
        // Actualizar valores de texto
        if (this.elements.textContent) {
            this.elements.textContent.value = media.text_content || '';
        }
        
        if (this.elements.fontFamily) {
            this.elements.fontFamily.value = media.font_family || 'Arial';
        }
        
        if (this.elements.fontSize) {
            this.elements.fontSize.value = media.font_size || 48;
        }
        
        if (this.elements.textColor) {
            this.elements.textColor.value = media.text_color || '#ffffff';
        }
        
        if (this.elements.textAlign) {
            this.elements.textAlign.value = media.text_align || 'left';
        }
        
        if (this.elements.fontBold) {
            this.elements.fontBold.checked = media.font_weight === 'bold';
        }
        
        if (this.elements.fontItalic) {
            this.elements.fontItalic.checked = media.font_style === 'italic';
        }
        
        if (this.elements.textShadowEnabled) {
            this.elements.textShadowEnabled.checked = media.text_shadow || false;
        }
        
        if (this.elements.textShadowColor) {
            this.elements.textShadowColor.value = media.text_shadow_color || '#000000';
        }
        
        if (this.elements.textShadowBlur) {
            this.elements.textShadowBlur.value = media.text_shadow_blur || 2;
        }
        
        // Mostrar/ocultar controles de sombra
        if (this.elements.shadowControls) {
            this.elements.shadowControls.style.display = media.text_shadow ? 'flex' : 'none';
        }
    }

    hideTextProperties() {
        // Ocultar paneles de texto
        if (this.elements.textProperties) {
            this.elements.textProperties.style.display = 'none';
        }
        if (this.elements.fontProperties) {
            this.elements.fontProperties.style.display = 'none';
        }
        if (this.elements.textStyleProperties) {
            this.elements.textStyleProperties.style.display = 'none';
        }
        if (this.elements.textShadowProperties) {
            this.elements.textShadowProperties.style.display = 'none';
        }
    }

    hideProperties() {
        if (this.elements.propertiesPanel) {
            this.elements.propertiesPanel.style.display = 'none';
        }
        this.hideTextProperties();
        this.state.selectedMediaId = null;
    }

    // Property change handlers
    handleOpacityChange() {
        if (!this.state.selectedMediaId || !this.elements.opacityControl) return;
        
        const value = this.elements.opacityControl.value / 100;
        if (this.elements.opacityValue) {
            this.elements.opacityValue.textContent = Math.round(this.elements.opacityControl.value) + '%';
        }
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'opacity',
            value: value
        });
    }

    handleVolumeChange() {
        if (!this.state.selectedMediaId || !this.elements.volumeControl) return;
        
        const value = this.elements.volumeControl.value / 100;
        if (this.elements.volumeValue) {
            this.elements.volumeValue.textContent = Math.round(this.elements.volumeControl.value) + '%';
        }
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'volume',
            value: value
        });
    }

    handlePositionChange() {
        if (!this.state.selectedMediaId || !this.elements.posX || !this.elements.posY) return;
        
        const x = parseInt(this.elements.posX.value) || 0;
        const y = parseInt(this.elements.posY.value) || 0;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'position',
            value: { x, y }
        });
    }

    handleSizeChange() {
        if (!this.state.selectedMediaId || !this.elements.sizeWidth || !this.elements.sizeHeight) return;
        
        const width = parseInt(this.elements.sizeWidth.value) || 100;
        const height = parseInt(this.elements.sizeHeight.value) || 100;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'size',
            value: { width, height }
        });
    }

    // Text property handlers
    handleTextContentChange() {
        if (!this.state.selectedMediaId || !this.elements.textContent) return;
        
        const value = this.elements.textContent.value;
        
        // Actualizar nombre en el panel de propiedades
        if (this.elements.selectedInfo) {
            const selectedName = this.elements.selectedInfo.querySelector('.selected-name');
            if (selectedName) {
                selectedName.textContent = value || 'Texto';
            }
        }
        
        // Actualizar en el estado local para que la lista se actualice
        if (this.state.activeMedia[this.state.selectedMediaId]) {
            this.state.activeMedia[this.state.selectedMediaId].text_content = value;
            this.renderActiveElements(); // Re-renderizar la lista
        }
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'text_content',
            value: value
        });
    }

    handleFontFamilyChange() {
        if (!this.state.selectedMediaId || !this.elements.fontFamily) return;
        
        const value = this.elements.fontFamily.value;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'font_family',
            value: value
        });
    }

    handleFontSizeChange() {
        if (!this.state.selectedMediaId || !this.elements.fontSize) return;
        
        const value = parseInt(this.elements.fontSize.value) || 48;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'font_size',
            value: value
        });
    }

    handleTextColorChange() {
        if (!this.state.selectedMediaId || !this.elements.textColor) return;
        
        const value = this.elements.textColor.value;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'text_color',
            value: value
        });
    }

    handleTextAlignChange() {
        if (!this.state.selectedMediaId || !this.elements.textAlign) return;
        
        const value = this.elements.textAlign.value;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'text_align',
            value: value
        });
    }

    handleFontBoldChange() {
        if (!this.state.selectedMediaId || !this.elements.fontBold) return;
        
        const value = this.elements.fontBold.checked ? 'bold' : 'normal';
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'font_weight',
            value: value
        });
    }

    handleFontItalicChange() {
        if (!this.state.selectedMediaId || !this.elements.fontItalic) return;
        
        const value = this.elements.fontItalic.checked ? 'italic' : 'normal';
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'font_style',
            value: value
        });
    }

    handleTextShadowEnabledChange() {
        if (!this.state.selectedMediaId || !this.elements.textShadowEnabled) return;
        
        const value = this.elements.textShadowEnabled.checked;
        
        // Mostrar/ocultar controles de sombra
        if (this.elements.shadowControls) {
            this.elements.shadowControls.style.display = value ? 'flex' : 'none';
        }
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'text_shadow',
            value: value
        });
    }

    handleTextShadowColorChange() {
        if (!this.state.selectedMediaId || !this.elements.textShadowColor) return;
        
        const value = this.elements.textShadowColor.value;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'text_shadow_color',
            value: value
        });
    }

    handleTextShadowBlurChange() {
        if (!this.state.selectedMediaId || !this.elements.textShadowBlur) return;
        
        const value = parseInt(this.elements.textShadowBlur.value) || 2;
        
        this.emit('propertyChange', {
            mediaId: this.state.selectedMediaId,
            property: 'text_shadow_blur',
            value: value
        });
    }

    // File handling
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.emit('filesSelected', files);
        }
        e.target.value = ''; // Reset input
    }

    handleDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            this.emit('filesDropped', files);
        }
    }

    // Drag and drop for media items
    handleMediaDragStart(e, media) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', media.id);
        
        this.emit('mediaDragStart', { event: e, media });
    }

    handleMediaDragEnd(e) {
        this.emit('mediaDragEnd', { event: e });
    }

    // Upload progress
    showUploadProgress() {
        if (this.elements.uploadProgress) {
            this.elements.uploadProgress.style.display = 'block';
        }
    }

    updateUploadProgress(percentage, text = 'Subiendo...') {
        if (this.elements.uploadProgress) {
            const progressFill = this.elements.uploadProgress.querySelector('.progress-fill');
            const progressText = this.elements.uploadProgress.querySelector('.progress-text');
            
            if (progressFill) {
                progressFill.style.width = percentage + '%';
            }
            if (progressText) {
                progressText.textContent = text;
            }
        }
    }

    hideUploadProgress() {
        if (this.elements.uploadProgress) {
            setTimeout(() => {
                this.elements.uploadProgress.style.display = 'none';
                const progressFill = this.elements.uploadProgress.querySelector('.progress-fill');
                if (progressFill) {
                    progressFill.style.width = '0%';
                }
            }, 1500);
        }
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
                if (this.activeMedia[id]) {
                    delete this.activeMedia[id];
                }
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

    // URL helpers
    setOverlayUrl(url) {
        if (this.elements.overlayUrl) {
            this.elements.overlayUrl.value = url;
        }
    }

    // Utilities
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    isElementOutsideCanvas(media, canvasWidth = 1920, canvasHeight = 1080) {
        return media.position.x < 0 || 
               media.position.x + media.size.width > canvasWidth ||
               media.position.y < 0 || 
               media.position.y + media.size.height > canvasHeight;
    }

    // Event system
    on(event, listener) {
        if (!this.updateListeners[event]) {
            this.updateListeners[event] = [];
        }
        this.updateListeners[event].push(listener);
    }

    emit(event, data) {
        if (this.updateListeners[event]) {
            this.updateListeners[event].forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error en listener de UI para evento ${event}:`, error);
                }
            });
        }
    }

    // Public API
    getSelectedMediaId() {
        return this.state.selectedMediaId;
    }

    getState() {
        return { ...this.state };
    }

    // Notifications
    showNotification(message, type = 'info', duration = 3000) {
        // Crear sistema de notificaciones simple
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-family: 'Inter', sans-serif;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        // Colores según tipo
        const colors = {
            info: '#007bff',
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }
}

export default UIManager;