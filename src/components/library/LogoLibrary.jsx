import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useLogoStore } from '../../store/logoStore';
import { useAppStore } from '../../store/appStore';
import { useEditorStore } from '../../store/editorStore';
import {
  readFileAsDataUrl,
  readFileAsText,
  getImageDimensions,
  getSvgDimensions,
  getExtension,
  generateSlug,
  checkTransparency,
  extractDominantColors,
  downloadDataUrl,
  downloadAsZip,
} from '../../utils/imageUtils';
import { uploadFile, deleteFile } from '../../utils/storage';
import {
  Search, Upload, Grid, List, FolderPlus, Tag, Trash2,
  Download, Check, X, Image, Plus, Filter, MoreVertical, Eye,
  ChevronDown, ChevronLeft, ChevronRight, ArrowRight, Link as LinkIcon,
  Minimize2, Maximize2,
} from 'lucide-react';

const ITEMS_PER_PAGE_OPTIONS = [24, 48, 96];

// --- Logo Card Component ---
function LogoCard({ logo, isSelected, inEditor, onToggleSelect, onPreview, onAddToEditor }) {
  const formatBadge = {
    svg: 'badge--svg',
    png: 'badge--png',
    webp: 'badge--webp',
  };

  return (
    <div
      className={`logo-card ${isSelected ? 'logo-card--selected' : ''}`}
      onClick={() => onToggleSelect(logo.id)}
      onDoubleClick={() => onPreview(logo)}
    >
      <div className="logo-card__preview">
        <div className="logo-card__preview-inner">
          <img
            className="logo-card__img"
            src={logo.file_path}
            alt={logo.name}
            draggable="false"
          />
        </div>
        <div className="logo-card__checkbox">
          {isSelected && <Check size={12} color="#fff" />}
        </div>
        {inEditor && (
          <div style={{
            position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)',
            background: 'var(--accent-success)', color: '#fff',
            borderRadius: 'var(--radius-sm)', padding: '2px 6px',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
            display: 'flex', alignItems: 'center', gap: 3,
            boxShadow: 'var(--shadow-sm)', zIndex: 1,
          }}>
            <Check size={10} /> In fascetta
          </div>
        )}
      </div>
      <div className="logo-card__info">
        <div className="logo-card__name" title={logo.name}>{logo.name}</div>
        <div className="logo-card__meta">
          <span className={`badge ${formatBadge[logo.original_format] || ''}`}>
            {logo.original_format.toUpperCase()}
          </span>
          {logo.width > 0 && (
            <span style={{ marginLeft: 4, fontSize: '0.625rem', color: 'var(--text-tertiary)' }}>
              {logo.width}×{logo.height}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Pagination ---
function Pagination({ currentPage, totalPages, totalItems, onPageChange, itemsPerPage }) {
  if (totalPages <= 1) return (
    <span className="pagination__info">{totalItems} loghi</span>
  );

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="pagination">
      <button
        className="pagination__btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <ChevronLeft size={14} />
      </button>

      {getPageNumbers().map((page, i) =>
        page === '...' ? (
          <span key={`dots-${i}`} className="pagination__info">…</span>
        ) : (
          <button
            key={page}
            className={`pagination__btn ${currentPage === page ? 'pagination__btn--active' : ''}`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        )
      )}

      <button
        className="pagination__btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <ChevronRight size={14} />
      </button>

      <span className="pagination__info">
        {totalItems} loghi · {itemsPerPage}/pag
      </span>
    </div>
  );
}

// --- Logo Preview Modal ---
function LogoPreview({ logo, onClose, onAddToEditor }) {
  const [bgMode, setBgMode] = useState('checker');
  
  const bgStyles = {
    checker: {
      background: `
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
      backgroundSize: '16px 16px',
      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
      backgroundColor: '#fff',
    },
    white: { backgroundColor: '#ffffff' },
    black: { backgroundColor: '#000000' },
    dark: { backgroundColor: '#1a1a2e' },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">{logo.name}</h3>
          <button className="btn btn--ghost btn--icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal__body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {Object.keys(bgStyles).map(mode => (
              <button
                key={mode}
                className={`btn btn--sm ${bgMode === mode ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setBgMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <div
            style={{
              ...bgStyles[bgMode],
              borderRadius: 'var(--radius-lg)',
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 250,
              border: '1px solid var(--border-default)',
            }}
          >
            <img
              src={logo.file_path}
              alt={logo.name}
              style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }}
            />
          </div>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="text-sm text-muted">Formato: <strong>{logo.original_format.toUpperCase()}</strong></div>
            <div className="text-sm text-muted">Dimensioni: <strong>{logo.width}×{logo.height}px</strong></div>
            <div className="text-sm text-muted">Aspect Ratio: <strong>{logo.aspect_ratio?.toFixed(2)}</strong></div>
            <div className="text-sm text-muted">Trasparenza: <strong>{logo.has_transparency ? 'Sì' : 'No'}</strong></div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={() => onAddToEditor(logo)}>
            <ArrowRight size={14} /> Aggiungi a fascetta
          </button>
          <button className="btn btn--primary" onClick={() => downloadDataUrl(logo.file_path, `${logo.name}.${logo.original_format}`)}>
            <Download size={14} /> Download
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Import from URL Modal ---
function ImportUrlModal({ onImport, onClose }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      await onImport(url.trim());
      onClose();
    } catch (err) {
      console.error('Import from URL failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Importa da URL</h3>
          <button className="btn btn--ghost btn--icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal__body">
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Inserisci l'URL di un logo in formato SVG, PNG o WebP.
          </p>
          <input
            className="input"
            type="url"
            placeholder="https://example.com/logo.svg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleImport()}
            autoFocus
          />
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Annulla</button>
          <button className="btn btn--primary" onClick={handleImport} disabled={loading || !url.trim()}>
            <Download size={14} /> {loading ? 'Importando...' : 'Importa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Drop Zone ---
function DropZone({ onFilesDropped }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(svg|png|webp)$/i.test(f.name)
    );
    if (files.length > 0) onFilesDropped(files);
  }, [onFilesDropped]);

  const handleFileInput = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) onFilesDropped(files);
    e.target.value = '';
  }, [onFilesDropped]);

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drop-zone--active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="drop-zone__icon" />
      <div className="drop-zone__text">
        Trascina qui i loghi oppure <strong>clicca per caricare</strong>
      </div>
      <div className="drop-zone__hint">SVG, PNG, WebP con trasparenza</div>
      <input
        ref={inputRef}
        type="file"
        accept=".svg,.png,.webp"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  );
}

// --- Helper: process a single file (browser File object) ---
// Uploads the file to R2 (web) or keeps data URL (Tauri)
async function processFile(file) {
  const ext = getExtension(file.name);
  const name = file.name.replace(/\.[^.]+$/, '');
  let dataUrl, width, height, hasTransparency, dominantColors;

  if (ext === 'svg') {
    const svgText = await readFileAsText(file);
    const dims = getSvgDimensions(svgText);
    width = dims.width;
    height = dims.height;
    dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
    hasTransparency = true;
    dominantColors = [];
  } else {
    dataUrl = await readFileAsDataUrl(file);
    const dims = await getImageDimensions(dataUrl);
    width = dims.width;
    height = dims.height;
    hasTransparency = await checkTransparency(dataUrl);
    dominantColors = await extractDominantColors(dataUrl);
  }

  // Upload to R2 (web) or keep data URL (Tauri/fallback)
  const fileUrl = await uploadFile(file, file.name);

  const tags = name.split(/[_\-\s]+/).filter(t => t.length > 1);
  return {
    name, slug: generateSlug(file.name), original_format: ext,
    file_path: fileUrl,
    thumbnail_path: dataUrl, // keep local data URL for fast thumbnails
    width, height, aspect_ratio: width / height,
    has_transparency: hasTransparency,
    dominant_colors: dominantColors, tags,
  };
}

// --- Helper: read file from Tauri filesystem path ---
async function readTauriFilePath(filePath) {
  const { readFile, readTextFile } = await import('@tauri-apps/plugin-fs');
  const ext = getExtension(filePath);
  const name = filePath.split('/').pop().split('\\').pop().replace(/\.[^.]+$/, '');

  if (ext === 'svg') {
    const text = await readTextFile(filePath);
    const dims = getSvgDimensions(text);
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    const tags = name.split(/[_\-\s]+/).filter(t => t.length > 1);
    return {
      name, slug: generateSlug(name), original_format: ext,
      file_path: dataUrl, thumbnail_path: dataUrl,
      width: dims.width, height: dims.height, aspect_ratio: dims.width / dims.height,
      has_transparency: true, dominant_colors: [], tags,
    };
  } else {
    const bytes = await readFile(filePath);
    const mimeType = ext === 'png' ? 'image/png' : 'image/webp';
    const blob = new Blob([bytes], { type: mimeType });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await getImageDimensions(dataUrl);
    const hasTransparency = await checkTransparency(dataUrl);
    const dominantColors = await extractDominantColors(dataUrl);
    const tags = name.split(/[_\-\s]+/).filter(t => t.length > 1);
    return {
      name, slug: generateSlug(name), original_format: ext,
      file_path: dataUrl, thumbnail_path: dataUrl,
      width: dims.width, height: dims.height, aspect_ratio: dims.width / dims.height,
      has_transparency: hasTransparency, dominant_colors: dominantColors, tags,
    };
  }
}

// --- Main LogoLibrary Component ---
export default function LogoLibrary() {
  const {
    logos, selectedIds, searchQuery, filterFormat, viewMode, isLoading,
    loadLogos, addLogo, removeLogo, search, toggleSelect, selectAll, clearSelection,
    setFilterFormat, setViewMode, getFilteredLogos, getSelectedLogos,
  } = useLogoStore();
  
  const showNotification = useAppStore(s => s.showNotification);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const addItem = useEditorStore(s => s.addItem);
  const isLogoInEditor = useEditorStore(s => s.isLogoInEditor);
  const editorItems = useEditorStore(s => s.items);
  
  const [previewLogo, setPreviewLogo] = useState(null);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [thumbSize, setThumbSize] = useState(180);
  const [gridContainerSize, setGridContainerSize] = useState({ w: 800, h: 400 });
  const gridContainerRef = useRef(null);

  // Auto-calculate items per page based on container size and thumb size
  const GAP = 12; // var(--space-3) = 12px
  const CARD_INFO_HEIGHT = 56; // name + badge area
  const PADDING = 32; // var(--space-4) * 2
  const OVERHEAD = 150; // drop zone (~110px) + slider bar (~40px)
  const LIST_ROW_HEIGHT = 52; // 48px thumb + 4px gap

  const itemsPerPage = useMemo(() => {
    const availW = gridContainerSize.w - PADDING;
    const availH = Math.max(100, gridContainerSize.h - OVERHEAD);

    if (viewMode === 'list') {
      // List: single column, each row ~52px
      const rows = Math.max(1, Math.floor(availH / LIST_ROW_HEIGHT));
      return rows;
    }

    // Grid: columns * rows
    const cols = Math.max(1, Math.floor((availW + GAP) / (thumbSize + GAP)));
    const cardH = thumbSize + CARD_INFO_HEIGHT; // square preview + info
    const rows = Math.max(1, Math.floor((availH + GAP) / (cardH + GAP)));
    return Math.max(1, cols * rows);
  }, [thumbSize, gridContainerSize, viewMode]);

  // Observe grid container size changes
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setGridContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Import progress
  const [importProgress, setImportProgress] = useState(null); // { done, total, current }

  const filteredLogos = getFilteredLogos();

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLogos.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedLogos = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return filteredLogos.slice(start, start + itemsPerPage);
  }, [filteredLogos, safePage, itemsPerPage]);

  // Reset page when search/filter/total changes
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterFormat, logos.length]);

  // --- Tauri native drag-and-drop ---
  useEffect(() => {
    let unlisten = null;
    async function setup() {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const appWindow = getCurrentWebviewWindow();
        unlisten = await appWindow.onDragDropEvent(async (event) => {
          if (event.payload.type === 'drop') {
            const paths = event.payload.paths.filter(p => /\.(svg|png|webp)$/i.test(p));
            if (paths.length > 0) await handleBatchImportPaths(paths);
          }
        });
      } catch {
        // Not in Tauri — DOM drag-and-drop handles it
      }
    }
    setup();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // --- Batch import from File objects (browser / file picker) ---
  const handleFilesDropped = useCallback(async (files) => {
    const validFiles = files.filter(f => /\.(svg|png|webp)$/i.test(f.name));
    if (validFiles.length === 0) return;

    const total = validFiles.length;
    let done = 0;
    setImportProgress({ done: 0, total, current: '' });

    // Process in batches of 5 for concurrency
    const BATCH_SIZE = 5;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = validFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          setImportProgress(prev => ({ ...prev, current: file.name }));
          const logoData = await processFile(file);
          await addLogo(logoData);
          done++;
          setImportProgress(prev => ({ ...prev, done }));
        })
      );
      // Brief yield to keep UI responsive
      await new Promise(r => setTimeout(r, 0));
    }

    setImportProgress(null);
    showNotification(`${done} logo importati con successo`, 'success');
  }, [addLogo, showNotification]);

  // --- Batch import from Tauri file paths ---
  const handleBatchImportPaths = useCallback(async (paths) => {
    const total = paths.length;
    let done = 0;
    setImportProgress({ done: 0, total, current: '' });

    const BATCH_SIZE = 5;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (path) => {
          const name = path.split('/').pop();
          setImportProgress(prev => ({ ...prev, current: name }));
          try {
            const logoData = await readTauriFilePath(path);
            await addLogo(logoData);
            done++;
            setImportProgress(prev => ({ ...prev, done }));
          } catch (err) {
            console.error(`Failed to import ${path}:`, err);
          }
        })
      );
      await new Promise(r => setTimeout(r, 0));
    }

    setImportProgress(null);
    if (done > 0) showNotification(`${done} logo importati con successo`, 'success');
  }, [addLogo, showNotification]);

  // Import from URL
  const handleImportFromUrl = useCallback(async (url) => {
    setImportProgress({ done: 0, total: 1, current: url });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const urlObj = new URL(url);
      const filename = urlObj.pathname.split('/').pop() || 'logo';
      const ext = getExtension(filename) || 'png';
      const file = new File([blob], `${filename.replace(/\.[^.]+$/, '')}.${ext}`, { type: blob.type });
      await handleFilesDropped([file]);
    } catch (err) {
      console.error('Import from URL failed:', err);
      showNotification(`Errore: impossibile scaricare da URL`, 'error');
      setImportProgress(null);
    }
  }, [handleFilesDropped, showNotification]);

  const handleAddToEditor = useCallback((logo) => {
    if (isLogoInEditor(logo.id)) {
      showNotification(`"${logo.name}" è già nella fascetta`, 'info');
      return;
    }
    addItem({
      id: logo.id,
      dataUrl: logo.file_path,
      name: logo.name,
      width: logo.width,
      height: logo.height,
    });
    setActiveTab('editor');
    showNotification(`"${logo.name}" aggiunto alla fascetta`, 'success');
  }, [addItem, isLogoInEditor, setActiveTab, showNotification]);

  const handleAddSelectedToEditor = useCallback(() => {
    const selected = getSelectedLogos();
    let added = 0;
    selected.forEach(logo => {
      const result = addItem({
        id: logo.id,
        dataUrl: logo.file_path,
        name: logo.name,
        width: logo.width,
        height: logo.height,
      });
      if (result) added++;
    });
    clearSelection();
    setActiveTab('editor');
    if (added > 0) {
      showNotification(`${added} loghi aggiunti alla fascetta`, 'success');
    } else {
      showNotification('Tutti i loghi selezionati sono già nella fascetta', 'info');
    }
  }, [getSelectedLogos, addItem, clearSelection, setActiveTab, showNotification]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const logosToDelete = logos.filter(l => ids.includes(l.id));
    for (const logo of logosToDelete) {
      // Delete file from R2 if stored there
      await deleteFile(logo.file_path);
      await removeLogo(logo.id);
    }
    showNotification(`${ids.length} loghi eliminati`, 'info');
  }, [selectedIds, logos, removeLogo, showNotification]);

  const handleBatchDownload = useCallback(async () => {
    const selected = getSelectedLogos();
    if (selected.length === 1) {
      downloadDataUrl(selected[0].file_path, `${selected[0].name}.${selected[0].original_format}`);
    } else {
      const files = selected.map(l => ({
        dataUrl: l.file_path,
        filename: `${l.name}.${l.original_format}`,
      }));
      await downloadAsZip(files);
    }
  }, [getSelectedLogos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-bar" style={{ flex: 1, maxWidth: 400 }}>
          <Search className="search-bar__icon" />
          <input
            className="input search-bar__input"
            placeholder="Cerca loghi per nome, tag..."
            value={searchQuery}
            onChange={e => search(e.target.value)}
          />
        </div>

        <div className="toolbar__separator" />

        <div className="toolbar__group">
          <button
            className={`btn btn--sm ${filterFormat === null ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setFilterFormat(null)}
          >
            Tutti
          </button>
          {['svg', 'png', 'webp'].map(fmt => (
            <button
              key={fmt}
              className={`btn btn--sm ${filterFormat === fmt ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setFilterFormat(filterFormat === fmt ? null : fmt)}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="toolbar__separator" />

        <div className="toolbar__group">
          <button
            className={`btn btn--ghost btn--icon ${viewMode === 'grid' ? 'btn--primary' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Griglia"
          >
            <Grid size={16} />
          </button>
          <button
            className={`btn btn--ghost btn--icon ${viewMode === 'list' ? 'btn--primary' : ''}`}
            onClick={() => setViewMode('list')}
            title="Lista"
          >
            <List size={16} />
          </button>
        </div>

        <div className="toolbar__separator" />

        <button className="btn btn--sm btn--ghost" onClick={() => setShowUrlImport(true)} title="Importa da URL">
          <LinkIcon size={14} /> Da URL
        </button>

        <div style={{ flex: 1 }} />

        {selectedIds.size > 0 && (
          <div className="toolbar__group" style={{ animation: 'slideUp 0.2s ease' }}>
            <span className="badge badge--accent">{selectedIds.size} selezionati</span>
            <button className="btn btn--sm btn--primary" onClick={handleAddSelectedToEditor}>
              <ArrowRight size={14} /> Fascetta
            </button>
            <button className="btn btn--sm btn--secondary" onClick={handleBatchDownload}>
              <Download size={14} /> Download
            </button>
            <button className="btn btn--sm btn--danger" onClick={handleDeleteSelected}>
              <Trash2 size={14} />
            </button>
            <button className="btn btn--sm btn--ghost" onClick={clearSelection}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={gridContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {filteredLogos.length === 0 && !isLoading ? (
          <div className="empty-state">
            <Image className="empty-state__icon" />
            <h3 className="empty-state__title">
              {logos.length === 0 ? 'Nessun logo nella libreria' : 'Nessun risultato'}
            </h3>
            <p className="empty-state__desc">
              {logos.length === 0
                ? 'Importa i tuoi loghi trascinandoli qui o cliccando il pulsante di upload.'
                : 'Prova a modificare i filtri di ricerca.'}
            </p>
            {logos.length === 0 && <DropZone onFilesDropped={handleFilesDropped} />}
          </div>
        ) : (
          <>
            {/* Compact drop zone */}
            <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
              <DropZone onFilesDropped={handleFilesDropped} />
            </div>

            {/* Logo Grid — paginated */}
            <div
              className={viewMode === 'list' ? 'logo-list' : 'logo-grid'}
              style={viewMode !== 'list' ? { '--thumb-size': `${thumbSize}px` } : undefined}
            >
              {paginatedLogos.map(logo => (
                <LogoCard
                  key={logo.id}
                  logo={logo}
                  isSelected={selectedIds.has(logo.id)}
                  inEditor={editorItems.some(i => i.logoId === logo.id)}
                  onToggleSelect={toggleSelect}
                  onPreview={setPreviewLogo}
                  onAddToEditor={handleAddToEditor}
                />
              ))}
            </div>

            {/* Pagination + Thumb slider */}
            <div className="thumb-slider-bar">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={filteredLogos.length}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
              />
              {viewMode !== 'list' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <Minimize2 size={12} />
                  <input
                    type="range"
                    min="80"
                    max="300"
                    step="10"
                    value={thumbSize}
                    onChange={(e) => setThumbSize(Number(e.target.value))}
                    title={`${thumbSize}px`}
                  />
                  <Maximize2 size={12} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Import Progress */}
      {importProgress && (
        <div className="progress-bar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>
              Importazione...
            </span>
            <span className="text-xs text-muted">
              {importProgress.done}/{importProgress.total}
            </span>
          </div>
          <div className="progress-bar__track">
            <div
              className="progress-bar__fill"
              style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
            />
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {importProgress.current}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewLogo && (
        <LogoPreview
          logo={previewLogo}
          onClose={() => setPreviewLogo(null)}
          onAddToEditor={(logo) => {
            handleAddToEditor(logo);
            setPreviewLogo(null);
          }}
        />
      )}

      {/* Import from URL Modal */}
      {showUrlImport && (
        <ImportUrlModal
          onImport={handleImportFromUrl}
          onClose={() => setShowUrlImport(false)}
        />
      )}
    </div>
  );
}
