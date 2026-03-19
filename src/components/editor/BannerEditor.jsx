import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Line, Group, Transformer } from 'react-konva';
import { useEditorStore } from '../../store/editorStore';
import { useLogoStore } from '../../store/logoStore';
import { useAppStore } from '../../store/appStore';
import ExportDialog from '../export/ExportDialog';
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Trash2,
  Lock, Unlock, RotateCcw, Settings, Move, Layers, Download, Save,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
  GripVertical, Eye, EyeOff, ChevronDown, Plus, Minus,
  ArrowUp, ArrowDown,
} from 'lucide-react';

// --- Snap Guide calculations ---
const SNAP_THRESHOLD = 5;

function getSnapLines(banner, items, movingItemId) {
  const lines = [];
  // Banner edges and center
  lines.push(
    { type: 'v', pos: banner.paddingLeft },
    { type: 'v', pos: banner.width - banner.paddingRight },
    { type: 'v', pos: banner.width / 2 },
    { type: 'h', pos: banner.paddingTop },
    { type: 'h', pos: banner.height - banner.paddingBottom },
    { type: 'h', pos: banner.height / 2 },
  );
  // Other items edges and centers
  items.filter(i => i.id !== movingItemId).forEach(i => {
    lines.push(
      { type: 'v', pos: i.x },
      { type: 'v', pos: i.x + i.width },
      { type: 'v', pos: i.x + i.width / 2 },
      { type: 'h', pos: i.y },
      { type: 'h', pos: i.y + i.height },
      { type: 'h', pos: i.y + i.height / 2 },
    );
  });
  return lines;
}

function snapPosition(pos, size, snapLines, type) {
  const edges = [pos, pos + size, pos + size / 2]; // left/top, right/bottom, center
  let bestDist = SNAP_THRESHOLD + 1;
  let bestSnap = pos;
  let matchLine = null;

  for (const line of snapLines.filter(l => l.type === type)) {
    for (let ei = 0; ei < edges.length; ei++) {
      const dist = Math.abs(edges[ei] - line.pos);
      if (dist < bestDist) {
        bestDist = dist;
        bestSnap = pos + (line.pos - edges[ei]);
        matchLine = line;
      }
    }
  }
  return { snapped: bestSnap, matched: bestDist <= SNAP_THRESHOLD ? matchLine : null };
}

// --- Canvas Logo Item ---
function CanvasLogoItem({ item, isSelected, banner, allItems, onSelect, onTransform, onSnapLines }) {
  const imageRef = useRef(null);
  const transformerRef = useRef(null);
  const [image, setImage] = useState(null);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = item.dataUrl;
  }, [item.dataUrl]);

  useEffect(() => {
    if (isSelected && transformerRef.current && imageRef.current) {
      transformerRef.current.nodes([imageRef.current]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const getFilters = () => {
    if (item.filter === 'grayscale') return [Konva?.Filters?.Grayscale].filter(Boolean);
    return [];
  };

  const handleDragMove = (e) => {
    const node = e.target;
    const snapLines = getSnapLines(banner, allItems, item.id);
    const sx = snapPosition(node.x(), item.width, snapLines, 'v');
    const sy = snapPosition(node.y(), item.height, snapLines, 'h');

    if (sx.matched || sy.matched) {
      node.x(sx.snapped);
      node.y(sy.snapped);
    }

    // Report active snap lines for visual feedback
    const activeLines = [];
    if (sx.matched) activeLines.push(sx.matched);
    if (sy.matched) activeLines.push(sy.matched);
    onSnapLines(activeLines);
  };

  return (
    <>
      <KonvaImage
        ref={imageRef}
        image={image}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation}
        opacity={item.opacity}
        draggable
        onClick={() => onSelect(item.id)}
        onTap={() => onSelect(item.id)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onSnapLines([]);
          onTransform(item.id, {
            x: Math.round(e.target.x()),
            y: Math.round(e.target.y()),
          });
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          
          onTransform(item.id, {
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.round(Math.max(10, node.width() * scaleX)),
            height: Math.round(Math.max(10, node.height() * scaleY)),
            rotation: Math.round(node.rotation()),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={transformerRef}
          keepRatio={item.lockAspectRatio}
          enabledAnchors={item.lockAspectRatio
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            : undefined
          }
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 10 || newBox.height < 10) return oldBox;
            return newBox;
          }}
          borderStroke="#1f6feb"
          anchorFill="#1f6feb"
          anchorStroke="#ffffff"
          anchorSize={8}
        />
      )}
    </>
  );
}

// --- Properties Panel ---
function PropertiesPanel({ item, onUpdate, onRemove }) {
  if (!item) {
    return (
      <div className="properties-panel">
        <div className="properties-panel__section">
          <p className="text-sm text-muted" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            Seleziona un logo nel canvas per modificarne le proprietà
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      <div className="properties-panel__section">
        <div className="properties-panel__label">Logo</div>
        <div className="text-sm" style={{ fontWeight: 'var(--font-medium)' }}>{item.name}</div>
      </div>

      <div className="properties-panel__section">
        <div className="properties-panel__label">Posizione</div>
        <div className="properties-panel__row">
          <span className="properties-panel__field-label">X</span>
          <input
            className="input properties-panel__field-input"
            type="number"
            value={Math.round(item.x)}
            onChange={e => onUpdate(item.id, { x: Number(e.target.value) })}
          />
        </div>
        <div className="properties-panel__row">
          <span className="properties-panel__field-label">Y</span>
          <input
            className="input properties-panel__field-input"
            type="number"
            value={Math.round(item.y)}
            onChange={e => onUpdate(item.id, { y: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="properties-panel__section">
        <div className="properties-panel__label">Dimensione</div>
        <div className="properties-panel__row">
          <span className="properties-panel__field-label">W</span>
          <input
            className="input properties-panel__field-input"
            type="number"
            value={Math.round(item.width)}
            onChange={e => onUpdate(item.id, { width: Number(e.target.value) })}
          />
        </div>
        <div className="properties-panel__row">
          <span className="properties-panel__field-label">H</span>
          <input
            className="input properties-panel__field-input"
            type="number"
            value={Math.round(item.height)}
            onChange={e => onUpdate(item.id, { height: Number(e.target.value) })}
          />
        </div>
        <div className="properties-panel__row">
          <button
            className={`btn btn--sm ${item.lockAspectRatio ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => onUpdate(item.id, { lockAspectRatio: !item.lockAspectRatio })}
            style={{ width: '100%' }}
          >
            {item.lockAspectRatio ? <Lock size={12} /> : <Unlock size={12} />}
            {item.lockAspectRatio ? 'Proporzioni bloccate' : 'Proporzioni libere'}
          </button>
        </div>
        {item.manualOverride && (
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => onUpdate(item.id, { manualOverride: false })}
            style={{ width: '100%', marginTop: 4, color: 'var(--accent-warning)', fontSize: 'var(--text-xs)' }}
          >
            <RotateCcw size={12} /> Reset dimensione automatica
          </button>
        )}
      </div>

      <div className="properties-panel__section">
        <div className="properties-panel__label">Rotazione</div>
        <div className="properties-panel__row">
          <span className="properties-panel__field-label">Gradi</span>
          <input
            className="input properties-panel__field-input"
            type="number"
            value={Math.round(item.rotation || 0)}
            onChange={e => onUpdate(item.id, { rotation: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="properties-panel__section">
        <div className="properties-panel__label">Opacità</div>
        <div className="properties-panel__row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={item.opacity}
            onChange={e => onUpdate(item.id, { opacity: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span className="text-xs text-muted" style={{ width: 36, textAlign: 'right' }}>
            {Math.round(item.opacity * 100)}%
          </span>
        </div>
      </div>

      <div className="properties-panel__section">
        <div className="properties-panel__label">Margini</div>
        {['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map(key => (
          <div className="properties-panel__row" key={key}>
            <span className="properties-panel__field-label">
              {key.replace('margin', '').charAt(0)}
            </span>
            <input
              className="input properties-panel__field-input"
              type="number"
              value={item[key] || 0}
              onChange={e => onUpdate(item.id, { [key]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>

      <div className="properties-panel__section">
        <div className="properties-panel__label">Filtro</div>
        <select
          className="input"
          value={item.filter || 'none'}
          onChange={e => onUpdate(item.id, { filter: e.target.value })}
        >
          <option value="none">Nessuno</option>
          <option value="grayscale">Scala di grigi</option>
        </select>
      </div>

      <div className="properties-panel__section">
        <button className="btn btn--danger btn--sm" style={{ width: '100%' }} onClick={() => onRemove(item.id)}>
          <Trash2 size={14} /> Rimuovi dal banner
        </button>
      </div>
    </div>
  );
}

// --- Banner Settings Panel ---
function BannerSettingsPanel() {
  const { banner, setBanner, presets, applyPreset, resetBanner, items, selectedItemId, selectItem, reorderItems } = useEditorStore();

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__title">Impostazioni Banner</span>
      </div>
      <div className="sidebar__content">
        {/* Presets */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Preset</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {presets.map((p, i) => (
              <button
                key={i}
                className="btn btn--sm btn--ghost"
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => applyPreset(p)}
              >
                {p.name}
                <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>
                  {p.width}×{p.height}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Dimensions */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Dimensioni (px)</div>
          <div className="properties-panel__row">
            <span className="properties-panel__field-label">W</span>
            <input
              className="input properties-panel__field-input"
              type="number"
              value={banner.width}
              onChange={e => setBanner({ width: Number(e.target.value) })}
            />
          </div>
          <div className="properties-panel__row">
            <span className="properties-panel__field-label">H</span>
            <input
              className="input properties-panel__field-input"
              type="number"
              value={banner.height}
              onChange={e => setBanner({ height: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Orientation */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Orientamento</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn btn--sm ${banner.orientation === 'horizontal' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setBanner({ orientation: 'horizontal' })}
            >
              Orizzontale
            </button>
            <button
              className={`btn btn--sm ${banner.orientation === 'vertical' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setBanner({ orientation: 'vertical' })}
            >
              Verticale
            </button>
          </div>
        </div>

        {/* Background */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Sfondo</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['solid', 'gradient', 'transparent'].map(type => (
              <button
                key={type}
                className={`btn btn--sm ${banner.backgroundType === type ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setBanner({ backgroundType: type })}
              >
                {type === 'solid' ? 'Colore' : type === 'gradient' ? 'Gradiente' : 'Trasparente'}
              </button>
            ))}
          </div>
          {banner.backgroundType === 'solid' && (
            <div className="properties-panel__row">
              <span className="properties-panel__field-label">Colore</span>
              <input
                type="color"
                value={banner.backgroundColor}
                onChange={e => setBanner({ backgroundColor: e.target.value })}
                style={{ height: 28, border: 'none', cursor: 'pointer' }}
              />
              <input
                className="input properties-panel__field-input"
                type="text"
                value={banner.backgroundColor}
                onChange={e => setBanner({ backgroundColor: e.target.value })}
                style={{ width: 80 }}
              />
            </div>
          )}
          {banner.backgroundType === 'gradient' && (
            <>
              <div className="properties-panel__row">
                <span className="properties-panel__field-label">Da</span>
                <input type="color" value={banner.gradientStart} onChange={e => setBanner({ gradientStart: e.target.value })} style={{ height: 28, border: 'none', cursor: 'pointer' }} />
              </div>
              <div className="properties-panel__row">
                <span className="properties-panel__field-label">A</span>
                <input type="color" value={banner.gradientEnd} onChange={e => setBanner({ gradientEnd: e.target.value })} style={{ height: 28, border: 'none', cursor: 'pointer' }} />
              </div>
              <div className="properties-panel__row">
                <span className="properties-panel__field-label">Angolo</span>
                <input className="input properties-panel__field-input" type="number" value={banner.gradientAngle} onChange={e => setBanner({ gradientAngle: Number(e.target.value) })} />
              </div>
            </>
          )}
        </div>

        {/* Padding */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Padding</div>
          {banner.paddingLinked ? (
            <div className="properties-panel__row">
              <span className="properties-panel__field-label">Tutti</span>
              <input
                className="input properties-panel__field-input"
                type="number"
                value={banner.padding}
                onChange={e => setBanner({ padding: Number(e.target.value) })}
              />
              <button className="btn btn--icon btn--sm btn--ghost" onClick={() => setBanner({ paddingLinked: false })}>
                <Lock size={12} />
              </button>
            </div>
          ) : (
            <>
              {['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map(key => (
                <div className="properties-panel__row" key={key}>
                  <span className="properties-panel__field-label">{key.replace('padding', '').charAt(0)}</span>
                  <input
                    className="input properties-panel__field-input"
                    type="number"
                    value={banner[key]}
                    onChange={e => setBanner({ [key]: Number(e.target.value) })}
                  />
                </div>
              ))}
              <button className="btn btn--sm btn--ghost" onClick={() => setBanner({ paddingLinked: true })}>
                <Unlock size={12} /> Sblocca singoli
              </button>
            </>
          )}
        </div>

        {/* Spacing & Alignment */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Spaziatura & Allineamento</div>
          <div className="properties-panel__row">
            <span className="properties-panel__field-label">Gap</span>
            <input
              className="input properties-panel__field-input"
              type="number"
              value={banner.uniformGap}
              onChange={e => setBanner({ uniformGap: Number(e.target.value) })}
            />
          </div>
          <div className="properties-panel__row">
            <span className="properties-panel__field-label">Allinea</span>
            <select
              className="input properties-panel__field-input"
              value={banner.alignItems}
              onChange={e => setBanner({ alignItems: e.target.value })}
            >
              <option value="start">Inizio</option>
              <option value="center">Centro</option>
              <option value="end">Fine</option>
            </select>
          </div>
          <div className="properties-panel__row">
            <span className="properties-panel__field-label">Distr.</span>
            <select
              className="input properties-panel__field-input"
              value={banner.justifyContent}
              onChange={e => setBanner({ justifyContent: e.target.value })}
            >
              <option value="start">Inizio</option>
              <option value="center">Centro</option>
              <option value="end">Fine</option>
              <option value="space-between">Spazio tra</option>
              <option value="space-evenly">Spazio uguale</option>
            </select>
          </div>
        </div>

        {/* Separators */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Separatori</div>
          <div className="properties-panel__row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
              <input
                type="checkbox"
                checked={banner.showSeparators}
                onChange={e => setBanner({ showSeparators: e.target.checked })}
              />
              Mostra separatori
            </label>
          </div>
          {banner.showSeparators && (
            <>
              <div className="properties-panel__row">
                <span className="properties-panel__field-label">Colore</span>
                <input type="color" value={banner.separatorColor} onChange={e => setBanner({ separatorColor: e.target.value })} style={{ height: 28, border: 'none', cursor: 'pointer' }} />
              </div>
              <div className="properties-panel__row">
                <span className="properties-panel__field-label">Spess.</span>
                <input className="input properties-panel__field-input" type="number" value={banner.separatorWidth} onChange={e => setBanner({ separatorWidth: Number(e.target.value) })} />
              </div>
            </>
          )}
        </div>

        {/* Items list */}
        <div className="properties-panel__section">
          <div className="properties-panel__label">Loghi nel banner ({items.length})</div>
          {items.length === 0 ? (
            <p className="text-xs text-muted">Aggiungi loghi dalla libreria</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={`btn btn--sm ${selectedItemId === item.id ? 'btn--secondary' : 'btn--ghost'}`}
                  style={{ justifyContent: 'flex-start', gap: 4, cursor: 'pointer' }}
                  onClick={() => selectItem(item.id)}
                >
                  <span className="truncate" style={{ flex: 1, fontSize: 'var(--text-xs)' }}>{item.name}</span>
                  {item.manualOverride && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-warning)' }} title="Override manuale" />
                  )}
                  <button
                    className="btn btn--ghost btn--icon"
                    style={{ width: 20, height: 20, padding: 0, minWidth: 0 }}
                    disabled={index === 0}
                    onClick={(e) => { e.stopPropagation(); reorderItems(index, index - 1); }}
                    title="Sposta su"
                  >
                    <ArrowUp size={10} />
                  </button>
                  <button
                    className="btn btn--ghost btn--icon"
                    style={{ width: 20, height: 20, padding: 0, minWidth: 0 }}
                    disabled={index === items.length - 1}
                    onClick={(e) => { e.stopPropagation(); reorderItems(index, index + 1); }}
                    title="Sposta giù"
                  >
                    <ArrowDown size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reset */}
        <div className="properties-panel__section">
          <button className="btn btn--danger btn--sm" style={{ width: '100%' }} onClick={resetBanner}>
            <RotateCcw size={14} /> Reset tutto
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Banner Editor ---
export default function BannerEditor() {
  const { banner, items, selectedItemId, selectItem, clearSelection, updateItem, removeItem, reorderItems, undo, redo, autoLayout } = useEditorStore();
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [showExport, setShowExport] = useState(false);
  const [activeSnapLines, setActiveSnapLines] = useState([]);

  // --- Project Save/Load ---
  const handleSaveProject = useCallback(async () => {
    try {
      const projectData = JSON.stringify({ banner, items }, null, 2);
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const filePath = await save({
          defaultPath: 'fascetta.logoproject',
          filters: [{ name: 'Logo Project', extensions: ['logoproject'] }],
        });
        if (filePath) {
          await writeTextFile(filePath, projectData);
          useAppStore.getState().showNotification('Progetto salvato', 'success');
        }
      } catch {
        // Browser fallback
        const blob = new Blob([projectData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'fascetta.logoproject';
        a.click(); URL.revokeObjectURL(url);
        useAppStore.getState().showNotification('Progetto scaricato', 'success');
      }
    } catch (err) {
      useAppStore.getState().showNotification('Errore salvataggio: ' + err.message, 'error');
    }
  }, [banner, items]);

  const handleLoadProject = useCallback(async () => {
    try {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const filePath = await open({
          filters: [{ name: 'Logo Project', extensions: ['logoproject'] }],
          multiple: false,
        });
        if (filePath) {
          const text = await readTextFile(filePath);
          const data = JSON.parse(text);
          useEditorStore.setState({ banner: data.banner, items: data.items });
          useAppStore.getState().showNotification('Progetto caricato', 'success');
        }
      } catch {
        // Browser fallback: file input
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.logoproject';
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const text = await file.text();
            const data = JSON.parse(text);
            useEditorStore.setState({ banner: data.banner, items: data.items });
            useAppStore.getState().showNotification('Progetto caricato', 'success');
          }
        };
        input.click();
      }
    } catch (err) {
      useAppStore.getState().showNotification('Errore caricamento: ' + err.message, 'error');
    }
  }, []);

  // Auto-fit canvas to container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
        
        // Auto-zoom to fit banner
        const scaleX = (rect.width - 80) / banner.width;
        const scaleY = (rect.height - 80) / banner.height;
        const newZoom = Math.min(scaleX, scaleY, 1);
        setZoom(Math.max(0.1, newZoom));
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [banner.width, banner.height]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemId && !e.target.closest('input, select, textarea')) {
          removeItem(selectedItemId);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedItemId, removeItem, undo, redo]);

  // Get background fill
  const getBgFill = () => {
    if (banner.backgroundType === 'transparent') return null;
    if (banner.backgroundType === 'solid') return banner.backgroundColor;
    return banner.backgroundColor; // gradient handled separately
  };

  const selectedItem = items.find(i => i.id === selectedItemId);

  // Position banner centered
  const offsetX = (stageSize.width - banner.width * zoom) / 2;
  const offsetY = (stageSize.height - banner.height * zoom) / 2;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left – Banner Settings */}
      <BannerSettingsPanel />

      {/* Center – Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div className="toolbar">
          <button className="btn btn--ghost btn--icon tooltip" data-tooltip="Annulla (⌘Z)" onClick={undo}>
            <Undo2 size={16} />
          </button>
          <button className="btn btn--ghost btn--icon tooltip" data-tooltip="Ripeti (⌘⇧Z)" onClick={redo}>
            <Redo2 size={16} />
          </button>

          <div className="toolbar__separator" />

          <button className="btn btn--ghost btn--icon" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-muted" style={{ width: 40, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="btn btn--ghost btn--icon" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>
            <ZoomIn size={16} />
          </button>
          <button className="btn btn--ghost btn--icon tooltip" data-tooltip="Adatta alla vista" onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const scaleX = (rect.width - 80) / banner.width;
              const scaleY = (rect.height - 80) / banner.height;
              setZoom(Math.min(scaleX, scaleY, 1));
            }
          }}>
            <Maximize2 size={16} />
          </button>

          <div className="toolbar__separator" />

          <button className="btn btn--sm btn--ghost" onClick={autoLayout}>
            <AlignHorizontalJustifyCenter size={14} /> Ricalcola layout
          </button>

          <div style={{ flex: 1 }} />

          <span className="text-xs text-muted">
            {banner.width}×{banner.height}px • {items.length} loghi
          </span>

          <div className="toolbar__separator" />

          <button className="btn btn--sm btn--ghost tooltip" data-tooltip="Carica progetto" onClick={handleLoadProject}>
            <Plus size={14} /> Apri
          </button>
          <button className="btn btn--sm btn--ghost tooltip" data-tooltip="Salva progetto" onClick={handleSaveProject}>
            <Save size={14} /> Salva
          </button>

          {items.length > 0 && (
            <>
              <div className="toolbar__separator" />
              <button className="btn btn--sm btn--primary" onClick={() => setShowExport(true)}>
                <Download size={14} /> Esporta
              </button>
            </>
          )}
        </div>

        {/* Canvas Area */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'hidden',
            background: `
              linear-gradient(45deg, var(--bg-tertiary) 25%, transparent 25%),
              linear-gradient(-45deg, var(--bg-tertiary) 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, var(--bg-tertiary) 75%),
              linear-gradient(-45deg, transparent 75%, var(--bg-tertiary) 75%)`,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
            backgroundColor: 'var(--bg-secondary)',
            cursor: 'default',
          }}
        >
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onClick={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'bg') {
                clearSelection();
              }
            }}
          >
            <Layer>
              <Group x={offsetX} y={offsetY} scaleX={zoom} scaleY={zoom}>
                {/* Banner Background */}
                <Rect
                  name="bg"
                  x={0}
                  y={0}
                  width={banner.width}
                  height={banner.height}
                  fill={getBgFill() || '#ffffff'}
                  stroke="#999"
                  strokeWidth={1 / zoom}
                  shadowBlur={10 / zoom}
                  shadowColor="rgba(0,0,0,0.2)"
                  shadowOffsetY={4 / zoom}
                />

                {/* Checkerboard for transparent bg */}
                {banner.backgroundType === 'transparent' && (
                  <Rect
                    x={0}
                    y={0}
                    width={banner.width}
                    height={banner.height}
                    fillPatternImage={(() => {
                      const canvas = document.createElement('canvas');
                      canvas.width = 16;
                      canvas.height = 16;
                      const ctx = canvas.getContext('2d');
                      ctx.fillStyle = '#fff';
                      ctx.fillRect(0, 0, 16, 16);
                      ctx.fillStyle = '#ddd';
                      ctx.fillRect(0, 0, 8, 8);
                      ctx.fillRect(8, 8, 8, 8);
                      return canvas;
                    })()}
                    fillPatternRepeat="repeat"
                    listening={false}
                  />
                )}

                {/* Separators */}
                {banner.showSeparators && items.length > 1 && items.slice(1).map((item, i) => {
                  const prev = items[i];
                  if (banner.orientation === 'horizontal') {
                    const midX = (prev.x + prev.width + item.x) / 2;
                    return (
                      <Line
                        key={`sep-${i}`}
                        points={[midX, banner.paddingTop, midX, banner.height - banner.paddingBottom]}
                        stroke={banner.separatorColor}
                        strokeWidth={banner.separatorWidth}
                      />
                    );
                  } else {
                    const midY = (prev.y + prev.height + item.y) / 2;
                    return (
                      <Line
                        key={`sep-${i}`}
                        points={[banner.paddingLeft, midY, banner.width - banner.paddingRight, midY]}
                        stroke={banner.separatorColor}
                        strokeWidth={banner.separatorWidth}
                      />
                    );
                  }
                })}

                {/* Logo Items */}
                {items.map(item => (
                  <CanvasLogoItem
                    key={item.id}
                    item={item}
                    isSelected={item.id === selectedItemId}
                    banner={banner}
                    allItems={items}
                    onSelect={selectItem}
                    onTransform={updateItem}
                    onSnapLines={setActiveSnapLines}
                  />
                ))}

                {/* Snap Guide Lines */}
                {activeSnapLines.map((line, i) => (
                  <Line
                    key={`snap-${i}`}
                    points={
                      line.type === 'v'
                        ? [line.pos, 0, line.pos, banner.height]
                        : [0, line.pos, banner.width, line.pos]
                    }
                    stroke="#ff00ff"
                    strokeWidth={1 / zoom}
                    dash={[4 / zoom, 4 / zoom]}
                    listening={false}
                  />
                ))}
              </Group>
            </Layer>
          </Stage>
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <Layers size={48} style={{ color: 'var(--text-tertiary)', opacity: 0.5, marginBottom: 16 }} />
            <p className="text-sm text-muted">Aggiungi loghi dalla libreria per iniziare</p>
          </div>
        )}
      </div>

      {/* Right – Properties */}
      <PropertiesPanel
        item={selectedItem}
        onUpdate={updateItem}
        onRemove={removeItem}
      />

      {/* Export Dialog */}
      {showExport && (
        <ExportDialog
          stageRef={stageRef}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
