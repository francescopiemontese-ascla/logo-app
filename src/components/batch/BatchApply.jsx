import React, { useState, useCallback, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useAppStore } from '../../store/appStore';
import {
  Upload, Download, FileText, X,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2,
} from 'lucide-react';

const POSITIONS = [
  { value: 'top', label: 'In alto', icon: ArrowUp },
  { value: 'bottom', label: 'In basso', icon: ArrowDown },
  { value: 'left', label: 'A sinistra', icon: ArrowLeft },
  { value: 'right', label: 'A destra', icon: ArrowRight },
];

const SCALE_OPTIONS = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
];

// --- Render the current banner to an image (offscreen canvas) ---
async function renderBannerToCanvas(banner, items, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = banner.width * scale;
  canvas.height = banner.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  if (banner.backgroundType === 'solid') {
    ctx.fillStyle = banner.backgroundColor;
    ctx.fillRect(0, 0, banner.width, banner.height);
  } else if (banner.backgroundType === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, banner.width, 0);
    grad.addColorStop(0, banner.gradientStart || banner.backgroundColor);
    grad.addColorStop(1, banner.gradientEnd || banner.backgroundColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, banner.width, banner.height);
  }

  for (const item of items) {
    try {
      const img = await loadImage(item.dataUrl);
      ctx.save();
      ctx.globalAlpha = item.opacity ?? 1;
      if (item.rotation) {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
      } else {
        ctx.drawImage(img, item.x, item.y, item.width, item.height);
      }
      ctx.restore();
    } catch (err) {
      console.warn(`Failed to draw "${item.name}":`, err);
    }
  }

  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// --- Compose image + banner OVERLAY (same page size, banner on top of content) ---
function compositeOverlay(docCanvas, bannerCanvas, position) {
  const dw = docCanvas.width;
  const dh = docCanvas.height;
  const bw = bannerCanvas.width;
  const bh = bannerCanvas.height;

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');

  // Draw original document
  ctx.drawImage(docCanvas, 0, 0);

  // Calculate banner position and scale to fit
  let bx, by, scaledBw, scaledBh;

  if (position === 'top' || position === 'bottom') {
    const bScale = dw / bw;
    scaledBw = dw;
    scaledBh = Math.round(bh * bScale);
    bx = 0;
    by = position === 'top' ? 0 : dh - scaledBh;
  } else {
    const bScale = dh / bh;
    scaledBh = dh;
    scaledBw = Math.round(bw * bScale);
    by = 0;
    bx = position === 'left' ? 0 : dw - scaledBw;
  }

  // Draw banner ON TOP of document content
  ctx.drawImage(bannerCanvas, bx, by, scaledBw, scaledBh);
  return canvas;
}

// --- File reading ---
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// --- Save helper ---
async function saveBlob(blob, outputName) {
  let saved = false;
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const filePath = await save({
      defaultPath: outputName,
      filters: [{ name: 'File', extensions: [outputName.split('.').pop()] }],
    });
    if (filePath) {
      try { await fs.remove(filePath); } catch { /* file doesn't exist */ }
      const arrayBuf = await blob.arrayBuffer();
      await fs.writeFile(filePath, new Uint8Array(arrayBuf));
      saved = true;
    }
  } catch { /* fallback to browser */ }

  if (!saved) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = outputName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// --- Overlay banner onto PDF pages using pdf-lib (preserves vectors) ---
async function overlayBannerOnPdf(pdfArrayBuffer, bannerCanvas, position) {
  const { PDFDocument } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
  const bannerBlob = await canvasToBlob(bannerCanvas);
  const bannerBuf = await bannerBlob.arrayBuffer();
  const bannerImg = await pdfDoc.embedPng(new Uint8Array(bannerBuf));

  const bannerAspect = bannerImg.width / bannerImg.height;
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width: pw, height: ph } = page.getSize();

    let bx, by, bw, bh;

    if (position === 'top' || position === 'bottom') {
      // Banner scaled to page width
      bw = pw;
      bh = pw / bannerAspect;
      bx = 0;
      // pdf-lib Y origin is BOTTOM-LEFT
      by = position === 'top' ? ph - bh : 0;
    } else {
      // Banner scaled to page height
      bh = ph;
      bw = ph * bannerAspect;
      bx = position === 'left' ? 0 : pw - bw;
      by = 0;
    }

    page.drawImage(bannerImg, { x: bx, y: by, width: bw, height: bh });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}


export default function BatchApply() {
  const { banner, items } = useEditorStore();
  const showNotification = useAppStore(s => s.showNotification);

  const [documents, setDocuments] = useState([]);
  const [position, setPosition] = useState('top');
  const [outputScale, setOutputScale] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileInputRef = useRef(null);

  const hasBanner = items.length > 0;

  // --- Add documents ---
  const handleAddDocuments = useCallback(async (files) => {
    const validFiles = Array.from(files).filter(f =>
      /\.(jpg|jpeg|png|webp|pdf)$/i.test(f.name)
    );
    if (validFiles.length === 0) {
      showNotification('Nessun file valido. Formati: JPG, PNG, WebP, PDF', 'error');
      return;
    }

    const newDocs = [];
    for (const file of validFiles) {
      try {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const dataUrl = isPdf ? null : await readFileAsDataUrl(file);
        const arrayBuf = isPdf ? await readFileAsArrayBuffer(file) : null;

        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          dataUrl,       // for images
          arrayBuf,      // for PDFs (raw bytes)
          type: isPdf ? 'pdf' : 'image',
          size: file.size,
        });
      } catch (err) {
        console.warn(`Failed to read ${file.name}:`, err);
      }
    }

    if (newDocs.length > 0) {
      setDocuments(prev => [...prev, ...newDocs]);
      showNotification(`${newDocs.length} documenti aggiunti`, 'success');
    }
  }, [showNotification]);

  const handleRemoveDoc = useCallback((id) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setDocuments([]);
  }, []);

  // --- Batch apply ---
  const handleBatchApply = useCallback(async () => {
    if (!hasBanner) {
      showNotification('Prima crea una fascetta nell\'Editor Fascette', 'error');
      return;
    }
    if (documents.length === 0) return;

    setProcessing(true);
    setProgress({ done: 0, total: documents.length });

    try {
      const bannerCanvas = await renderBannerToCanvas(banner, items, outputScale);
      let done = 0;

      for (const doc of documents) {
        try {
          if (doc.type === 'image') {
            // Image: overlay banner on raster image
            const img = await loadImage(doc.dataUrl);
            const imgCanvas = document.createElement('canvas');
            imgCanvas.width = img.naturalWidth;
            imgCanvas.height = img.naturalHeight;
            imgCanvas.getContext('2d').drawImage(img, 0, 0);

            const result = compositeOverlay(imgCanvas, bannerCanvas, position);
            const blob = await canvasToBlob(result);
            const outputName = doc.name.replace(/\.[^.]+$/, '') + '_fascetta.png';
            await saveBlob(blob, outputName);

          } else if (doc.type === 'pdf') {
            // PDF: use pdf-lib to overlay banner as image (preserves vectors)
            const pdfBlob = await overlayBannerOnPdf(doc.arrayBuf, bannerCanvas, position);
            const outputName = doc.name.replace(/\.[^.]+$/, '') + '_fascetta.pdf';
            await saveBlob(pdfBlob, outputName);
          }
        } catch (err) {
          console.error(`Failed to process ${doc.name}:`, err);
          showNotification(`Errore ${doc.name}: ${err?.message || String(err)}`, 'error');
        }

        done++;
        setProgress({ done, total: documents.length });
      }

      showNotification(`${done} file elaborati con successo!`, 'success');
    } catch (err) {
      console.error('Batch apply failed:', err);
      showNotification(`Errore: ${err?.message || String(err)}`, 'error');
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(null), 2000);
    }
  }, [banner, items, documents, position, outputScale, hasBanner, showNotification]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', flex: 1 }}>
          Applica Fascetta
        </h2>
        {!hasBanner && (
          <span className="badge" style={{ background: 'var(--accent-warning)', color: '#fff', padding: '4px 10px' }}>
            ⚠ Crea prima una fascetta
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        borderBottom: '1px solid var(--border-muted)',
        flexWrap: 'wrap',
      }}>
        <span className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>Posizione:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {POSITIONS.map(p => (
            <button
              key={p.value}
              className={`btn btn--sm ${position === p.value ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setPosition(p.value)}
            >
              <p.icon size={14} />
              {p.label}
            </button>
          ))}
        </div>

        <div className="toolbar__separator" />

        <span className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>Risoluzione banner:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {SCALE_OPTIONS.map(s => (
            <button
              key={s.value}
              className={`btn btn--sm ${outputScale === s.value ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setOutputScale(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button className="btn btn--sm btn--secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} /> Aggiungi documenti
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => { handleAddDocuments(e.target.files); e.target.value = ''; }}
        />
        {documents.length > 0 && (
          <>
            <button className="btn btn--sm btn--danger" onClick={handleClearAll}>
              <Trash2 size={14} /> Rimuovi tutti
            </button>
            <button
              className="btn btn--sm btn--primary"
              onClick={handleBatchApply}
              disabled={processing || !hasBanner}
            >
              <Download size={14} />
              {processing ? 'Elaborazione...' : `Applica a ${documents.length} doc`}
            </button>
          </>
        )}
      </div>

      {/* Progress */}
      {progress && (
        <div className="progress-bar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>
              Elaborazione...
            </span>
            <span className="text-xs text-muted">{progress.done}/{progress.total}</span>
          </div>
          <div className="progress-bar__track" style={{ marginTop: 6 }}>
            <div
              className="progress-bar__fill"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Document list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-4)' }}>
        {documents.length === 0 ? (
          <div className="empty-state" style={{ border: '2px dashed var(--border-muted)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-12)' }}>
            <Upload size={48} style={{ color: 'var(--text-tertiary)', opacity: 0.5, marginBottom: 16 }} />
            <h3 className="empty-state__title">Carica i documenti</h3>
            <p className="empty-state__desc">
              Aggiungi immagini (JPG, PNG, WebP) o PDF a cui applicare la fascetta.
              <br />La fascetta verrà sovrapposta nella posizione scelta.
              <br />I PDF mantengono il contenuto vettoriale originale.
            </p>
            <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()} style={{ marginTop: 16 }}>
              <Upload size={14} /> Seleziona file
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
          }}>
            {documents.map(doc => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border-muted)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'relative',
                  paddingTop: '70%',
                  background: 'var(--bg-secondary)',
                  overflow: 'hidden',
                }}>
                  {doc.type === 'image' ? (
                    <img
                      src={doc.dataUrl}
                      alt={doc.name}
                      style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '100%', height: '100%', objectFit: 'contain',
                        padding: 8,
                      }}
                    />
                  ) : (
                    <div style={{
                      position: 'absolute', top: 0, left: 0,
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 4,
                    }}>
                      <FileText size={36} style={{ color: 'var(--accent-primary)', opacity: 0.7 }} />
                      <span className="text-xs" style={{ color: 'var(--accent-success)' }}>Vettoriale</span>
                    </div>
                  )}
                  <button
                    className="btn btn--ghost btn--icon"
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(0,0,0,0.6)', borderRadius: '50%',
                      width: 24, height: 24,
                    }}
                    onClick={(e) => { e.stopPropagation(); handleRemoveDoc(doc.id); }}
                  >
                    <X size={12} color="#fff" />
                  </button>
                </div>
                <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                  <div style={{
                    fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {doc.type === 'pdf' ? 'PDF → PDF (vett.)' : 'Immagine → PNG'}
                    {' · '}
                    {(doc.size / 1024).toFixed(0)} KB
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
