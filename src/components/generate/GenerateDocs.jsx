import React, { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useAppStore } from '../../store/appStore';
import {
  FileOutput, FileText, Download,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
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

// --- Render banner to canvas ---
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

async function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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
      try { await fs.remove(filePath); } catch { /* doesn't exist */ }
      const arrayBuf = await blob.arrayBuffer();
      await fs.writeFile(filePath, new Uint8Array(arrayBuf));
      saved = true;
    }
  } catch { /* browser fallback */ }

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

// --- Generate Word doc ---
async function generateWordDoc(bannerCanvas, position) {
  const {
    Document, Packer, Header, Footer, Paragraph, ImageRun,
    PageOrientation, AlignmentType,
  } = await import('docx');

  const bannerBlob = await canvasToBlob(bannerCanvas);
  const bannerBuf = await bannerBlob.arrayBuffer();
  const bannerBytes = new Uint8Array(bannerBuf);

  const marginMm = 5;
  const pageWidthMm = 210 - marginMm * 2;
  const DPI = 96;
  const PX_PER_MM = DPI / 25.4;
  const ratio = bannerCanvas.height / bannerCanvas.width;
  const imgWidthPx = Math.round(pageWidthMm * PX_PER_MM);
  const imgHeightPx = Math.round(pageWidthMm * ratio * PX_PER_MM);

  const bannerImage = new ImageRun({
    data: bannerBytes,
    transformation: { width: imgWidthPx, height: imgHeightPx },
    type: 'png',
  });

  const bannerParagraph = new Paragraph({
    children: [bannerImage],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
  });

  const isHeader = position === 'top' || position === 'left';
  const TWIPS_PER_MM = 1440 / 25.4;
  const marginTwip = Math.round(marginMm * TWIPS_PER_MM);
  const headerFooterDist = Math.round(2 * TWIPS_PER_MM);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {
            orientation: PageOrientation.PORTRAIT,
            width: Math.round(210 * TWIPS_PER_MM),
            height: Math.round(297 * TWIPS_PER_MM),
          },
          margin: {
            top: marginTwip,
            bottom: marginTwip,
            left: marginTwip,
            right: marginTwip,
            header: headerFooterDist,
            footer: headerFooterDist,
          },
        },
      },
      headers: {
        default: isHeader
          ? new Header({ children: [bannerParagraph] })
          : new Header({ children: [] }),
      },
      footers: {
        default: !isHeader
          ? new Footer({ children: [bannerParagraph] })
          : new Footer({ children: [] }),
      },
      children: [new Paragraph({ text: '' })],
    }],
  });

  return Packer.toBlob(doc);
}

// --- Generate blank PDF with banner ---
async function generateBlankPdf(bannerCanvas, position) {
  const { PDFDocument } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const bannerBlob = await canvasToBlob(bannerCanvas);
  const bannerBuf = await bannerBlob.arrayBuffer();
  const bannerImg = await pdfDoc.embedPng(new Uint8Array(bannerBuf));

  // A4 in points: 595.28 × 841.89
  const pw = 595.28;
  const ph = 841.89;
  const page = pdfDoc.addPage([pw, ph]);

  const bannerAspect = bannerImg.width / bannerImg.height;
  let bx, by, bw, bh;

  if (position === 'top' || position === 'bottom') {
    bw = pw;
    bh = pw / bannerAspect;
    bx = 0;
    by = position === 'top' ? ph - bh : 0;
  } else {
    bh = ph;
    bw = ph * bannerAspect;
    bx = position === 'left' ? 0 : pw - bw;
    by = 0;
  }

  page.drawImage(bannerImg, { x: bx, y: by, width: bw, height: bh });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}


export default function GenerateDocs() {
  const { banner, items } = useEditorStore();
  const showNotification = useAppStore(s => s.showNotification);

  const [position, setPosition] = useState('top');
  const [outputScale, setOutputScale] = useState(2);
  const [processing, setProcessing] = useState(false);

  const hasBanner = items.length > 0;

  const handleGenerate = useCallback(async (format) => {
    if (!hasBanner) {
      showNotification('Prima crea una fascetta nell\'Editor Fascette', 'error');
      return;
    }

    setProcessing(true);
    try {
      const bannerCanvas = await renderBannerToCanvas(banner, items, outputScale);

      if (format === 'word') {
        const blob = await generateWordDoc(bannerCanvas, position);
        await saveBlob(blob, 'fascetta.docx');
        showNotification('Documento Word generato!', 'success');
      } else if (format === 'pdf') {
        const blob = await generateBlankPdf(bannerCanvas, position);
        await saveBlob(blob, 'fascetta.pdf');
        showNotification('Documento PDF generato!', 'success');
      } else if (format === 'png') {
        const blob = await canvasToBlob(bannerCanvas);
        await saveBlob(blob, 'fascetta.png');
        showNotification('Immagine PNG esportata!', 'success');
      }
    } catch (err) {
      console.error(`Generate ${format} failed:`, err);
      showNotification(`Errore: ${err?.message || String(err)}`, 'error');
    } finally {
      setProcessing(false);
    }
  }, [banner, items, position, outputScale, hasBanner, showNotification]);

  const formats = [
    {
      id: 'word',
      label: 'Documento Word',
      desc: 'File .docx con fascetta nell\'intestazione o piè di pagina. Aprilo in Word o Google Docs e scrivi il contenuto.',
      icon: FileOutput,
      ext: '.docx',
    },
    {
      id: 'pdf',
      label: 'Documento PDF',
      desc: 'File .pdf A4 vuoto con la fascetta sovrapposta nella posizione scelta. Ideale per stampa.',
      icon: FileText,
      ext: '.pdf',
    },
    {
      id: 'png',
      label: 'Immagine PNG',
      desc: 'Esporta solo la fascetta come immagine PNG ad alta risoluzione. Utile per web o inserimento manuale.',
      icon: Download,
      ext: '.png',
    },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', flex: 1 }}>
          Genera Documenti
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
        <span className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>Posizione fascetta:</span>
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

        <span className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>Risoluzione:</span>
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
      </div>

      {/* Format cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-4)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'var(--space-4)',
        }}>
          {formats.map(fmt => (
            <div
              key={fmt.id}
              style={{
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-3)',
                textAlign: 'center',
                cursor: hasBanner && !processing ? 'pointer' : 'not-allowed',
                opacity: hasBanner ? 1 : 0.5,
                transition: 'all 0.15s ease',
              }}
              onClick={() => hasBanner && !processing && handleGenerate(fmt.id)}
              onMouseEnter={(e) => {
                if (hasBanner) {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-muted)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <fmt.icon size={28} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--font-semibold)' }}>
                {fmt.label}
              </h3>
              <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
                {fmt.desc}
              </p>
              <span className="text-xs" style={{
                color: 'var(--accent-primary)',
                fontWeight: 'var(--font-medium)',
                background: 'var(--bg-secondary)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-md)',
              }}>
                {fmt.ext}
              </span>
            </div>
          ))}
        </div>

        {processing && (
          <div style={{
            marginTop: 'var(--space-4)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
          }}>
            Generazione in corso...
          </div>
        )}
      </div>
    </div>
  );
}
