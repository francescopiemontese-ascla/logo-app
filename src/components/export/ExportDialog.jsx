import React, { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useAppStore } from '../../store/appStore';
import { Download, FileText, Image, X } from 'lucide-react';

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG', desc: 'Immagine con trasparenza' },
  { value: 'webp', label: 'WebP', desc: 'Formato moderno, più leggero' },
  { value: 'pdf', label: 'PDF', desc: 'Vettoriale per stampa' },
];

const SCALE_OPTIONS = [
  { value: 1, label: '1x (72 DPI)', desc: 'Web / Screen' },
  { value: 2, label: '2x (150 DPI)', desc: 'Qualità media' },
  { value: 4, label: '4x (300 DPI)', desc: 'Stampa professionale' },
];

// Convert data URL to Uint8Array
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Decode SVG data URL to SVG text
function decodeSvgDataUrl(dataUrl) {
  if (dataUrl.includes('base64,')) {
    const base64 = dataUrl.split('base64,')[1];
    return atob(base64);
  }
  // Handle non-base64 SVG data URLs
  const encoded = dataUrl.split(',')[1];
  return decodeURIComponent(encoded);
}

// Check if data URL is SVG
function isSvgDataUrl(dataUrl) {
  return dataUrl && dataUrl.startsWith('data:image/svg');
}

// Parse SVG text into a DOM element
function parseSvgElement(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  
  // Ensure SVG has proper namespace
  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  
  return svg;
}

// Save file using Tauri dialog + fs, fallback to browser download
async function saveFile(dataOrBytes, defaultFilename, filters, isBlob = false) {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: filters || [],
    });
    
    if (filePath) {
      const bytes = isBlob ? dataOrBytes : dataUrlToBytes(dataOrBytes);
      await writeFile(filePath, bytes);
      return true;
    }
    return false;
  } catch (err) {
    console.log('Tauri save not available, using browser fallback');
    
    if (isBlob) {
      const blob = new Blob([dataOrBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = defaultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const link = document.createElement('a');
      link.href = dataOrBytes;
      link.download = defaultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    return true;
  }
}

// --- Vector PDF Export ---
async function exportVectorPdf(banner, items, filename) {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');
  
  const isLandscape = banner.width > banner.height;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'px',
    format: [banner.width, banner.height],
    hotfixes: ['px_scaling'],
  });

  // 1. Draw background
  if (banner.backgroundType === 'solid') {
    doc.setFillColor(banner.backgroundColor);
    doc.rect(0, 0, banner.width, banner.height, 'F');
  } else if (banner.backgroundType === 'gradient') {
    // PDF doesn't support gradients natively in jsPDF — approximate with solid
    doc.setFillColor(banner.gradientStart);
    doc.rect(0, 0, banner.width, banner.height, 'F');
  }
  // transparent: no fill

  // 2. Add each logo item
  for (const item of items) {
    if (isSvgDataUrl(item.dataUrl)) {
      // --- Vector SVG: embed as native PDF vector paths ---
      try {
        const svgText = decodeSvgDataUrl(item.dataUrl);
        const svgElement = parseSvgElement(svgText);
        
        // svg2pdf.js patches jsPDF with the .svg() method
        await doc.svg(svgElement, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        });
      } catch (err) {
        console.warn(`Failed to embed SVG "${item.name}" as vector, falling back to raster:`, err);
        // Fallback: embed as raster image
        doc.addImage(item.dataUrl, 'PNG', item.x, item.y, item.width, item.height);
      }
    } else {
      // --- Bitmap (PNG/WebP): embed as raster image ---
      try {
        doc.addImage(item.dataUrl, 'PNG', item.x, item.y, item.width, item.height);
      } catch (err) {
        console.warn(`Failed to embed "${item.name}":`, err);
      }
    }
  }

  // 3. Draw separators
  if (banner.showSeparators && items.length > 1) {
    doc.setDrawColor(banner.separatorColor);
    doc.setLineWidth(banner.separatorWidth);
    
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const curr = items[i];
      
      if (banner.orientation === 'horizontal') {
        const midX = (prev.x + prev.width + curr.x) / 2;
        doc.line(midX, banner.paddingTop, midX, banner.height - banner.paddingBottom);
      } else {
        const midY = (prev.y + prev.height + curr.y) / 2;
        doc.line(banner.paddingLeft, midY, banner.width - banner.paddingRight, midY);
      }
    }
  }

  // 4. Save
  const pdfBytes = doc.output('arraybuffer');
  return new Uint8Array(pdfBytes);
}

// --- Raster Export (PNG/WebP) ---
async function exportRaster(stageRef, banner, format, scale, quality) {
  const stage = stageRef?.current;
  if (!stage) throw new Error('Canvas non disponibile');

  const layer = stage.findOne('Layer');
  const group = layer?.findOne('Group');
  if (!group) throw new Error('Contenuto banner non trovato');

  // Save and reset group transform for clean export
  const origX = group.x(), origY = group.y();
  const origSX = group.scaleX(), origSY = group.scaleY();
  group.x(0); group.y(0); group.scaleX(1); group.scaleY(1);

  const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
  const dataUrl = group.toDataURL({
    x: 0, y: 0,
    width: banner.width, height: banner.height,
    pixelRatio: scale, mimeType,
    quality: format === 'webp' ? quality : undefined,
  });

  // Restore
  group.x(origX); group.y(origY);
  group.scaleX(origSX); group.scaleY(origSY);
  layer.batchDraw();

  return dataUrl;
}

export default function ExportDialog({ stageRef, onClose }) {
  const { banner, items } = useEditorStore();
  const showNotification = useAppStore(s => s.showNotification);
  
  const [format, setFormat] = useState('png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(0.92);
  const [filename, setFilename] = useState('fascetta');
  const [exporting, setExporting] = useState(false);

  const outputWidth = Math.round(banner.width * scale);
  const outputHeight = Math.round(banner.height * scale);

  // Count vector vs raster logos
  const svgCount = items.filter(i => isSvgDataUrl(i.dataUrl)).length;
  const rasterCount = items.length - svgCount;

  const handleExport = async () => {
    setExporting(true);
    try {
      if (format === 'pdf') {
        // --- Vector PDF export ---
        const pdfBytes = await exportVectorPdf(banner, items, filename);
        const saved = await saveFile(pdfBytes, `${filename}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }], true);
        if (!saved) { setExporting(false); return; }
      } else {
        // --- Raster export (PNG/WebP) ---
        const dataUrl = await exportRaster(stageRef, banner, format, scale, quality);
        const ext = format === 'webp' ? 'webp' : 'png';
        const filters = format === 'webp'
          ? [{ name: 'WebP', extensions: ['webp'] }]
          : [{ name: 'PNG', extensions: ['png'] }];
        const saved = await saveFile(dataUrl, `${filename}.${ext}`, filters);
        if (!saved) { setExporting(false); return; }
      }

      showNotification(`Fascetta esportata come ${format.toUpperCase()}`, 'success');
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      showNotification(`Errore: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Esporta Fascetta</h3>
          <button className="btn btn--ghost btn--icon" onClick={onClose}><X size={16} /></button>
        </div>
        
        <div className="modal__body">
          {/* Filename */}
          <div style={{ marginBottom: 16 }}>
            <label className="properties-panel__label">Nome file</label>
            <input
              className="input"
              value={filename}
              onChange={e => setFilename(e.target.value)}
              placeholder="fascetta"
            />
          </div>

          {/* Format */}
          <div style={{ marginBottom: 16 }}>
            <label className="properties-panel__label">Formato</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`btn ${format === opt.value ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ flex: 1, flexDirection: 'column', padding: '12px 8px', height: 'auto' }}
                  onClick={() => setFormat(opt.value)}
                >
                  {opt.value === 'pdf' ? <FileText size={20} /> : <Image size={20} />}
                  <strong>{opt.label}</strong>
                  <span className="text-xs" style={{ opacity: 0.7 }}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scale (only for raster) */}
          {format !== 'pdf' && (
            <div style={{ marginBottom: 16 }}>
              <label className="properties-panel__label">Risoluzione</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {SCALE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`btn btn--sm ${scale === opt.value ? 'btn--primary' : 'btn--secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setScale(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-2">
                Output: {outputWidth}×{outputHeight}px
              </p>
            </div>
          )}

          {/* Quality (WebP only) */}
          {format === 'webp' && (
            <div style={{ marginBottom: 16 }}>
              <label className="properties-panel__label">
                Qualità: {Math.round(quality * 100)}%
              </label>
              <input
                type="range" min="0.1" max="1" step="0.05"
                value={quality}
                onChange={e => setQuality(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Info */}
          <div style={{
            padding: 'var(--space-3)', background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
          }}>
            <div>Banner: {banner.width}×{banner.height}px</div>
            {format !== 'pdf' && <div>Scala: {scale}x → {outputWidth}×{outputHeight}px</div>}
            <div>Formato: {format.toUpperCase()}</div>
            {format === 'pdf' && (
              <>
                <div style={{ color: 'var(--accent-success)', marginTop: 4 }}>
                  ✓ {svgCount} loghi SVG esportati come vettoriali
                </div>
                {rasterCount > 0 && (
                  <div style={{ color: 'var(--accent-warning)' }}>
                    ⚠ {rasterCount} loghi bitmap (PNG/WebP) incorporati come raster
                  </div>
                )}
              </>
            )}
            {format === 'png' && banner.backgroundType === 'transparent' && (
              <div style={{ color: 'var(--accent-success)', marginTop: 4 }}>✓ Trasparenza preservata</div>
            )}
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Annulla</button>
          <button className="btn btn--primary" onClick={handleExport} disabled={exporting}>
            <Download size={14} />
            {exporting ? 'Esportando...' : 'Esporta'}
          </button>
        </div>
      </div>
    </div>
  );
}
