import { create } from 'zustand';

const DEFAULT_BANNER = {
  width: 1200,
  height: 200,
  orientation: 'horizontal', // 'horizontal' | 'vertical'
  backgroundColor: '#ffffff',
  backgroundType: 'solid', // 'solid' | 'gradient' | 'transparent'
  gradientStart: '#ffffff',
  gradientEnd: '#f0f0f0',
  gradientAngle: 90,
  padding: 20,
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  paddingLinked: true,
  logoSpacing: 'uniform', // 'uniform' | 'custom'
  uniformGap: 40,
  alignItems: 'center', // 'start' | 'center' | 'end'
  justifyContent: 'center', // 'start' | 'center' | 'end' | 'space-between' | 'space-evenly'
  showSeparators: false,
  separatorColor: '#cccccc',
  separatorWidth: 1,
};

const DEFAULT_LOGO_ITEM = {
  id: null,
  logoId: null,
  dataUrl: '',
  name: '',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  originalWidth: 100,
  originalHeight: 100,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  lockAspectRatio: true,
  opacity: 1,
  manualOverride: false,
  marginLeft: 0,
  marginRight: 0,
  marginTop: 0,
  marginBottom: 0,
  filter: 'none', // 'none' | 'grayscale' | 'invert'
};

let itemIdCounter = 1;

export const useEditorStore = create((set, get) => ({
  // Banner settings
  banner: { ...DEFAULT_BANNER },
  
  // Logos placed on the banner
  items: [],
  
  // Selection
  selectedItemId: null,
  
  // History
  history: [],
  historyIndex: -1,
  maxHistory: 50,
  
  // Presets
  presets: [
    { name: 'Intestazione Istituzionale', width: 1200, height: 150, orientation: 'horizontal' },
    { name: 'Banner Evento', width: 1200, height: 250, orientation: 'horizontal' },
    { name: 'Footer Documento', width: 1000, height: 120, orientation: 'horizontal' },
    { name: 'Facebook Cover', width: 820, height: 312, orientation: 'horizontal' },
    { name: 'LinkedIn Banner', width: 1584, height: 396, orientation: 'horizontal' },
    { name: 'Fascetta Verticale', width: 200, height: 800, orientation: 'vertical' },
    { name: 'Roll-up Laterale', width: 300, height: 1200, orientation: 'vertical' },
  ],

  // --- Banner Actions ---
  setBanner: (updates) => {
    const state = get();
    const newBanner = { ...state.banner, ...updates };
    
    // If padding is linked, sync all paddings
    if (updates.padding !== undefined && newBanner.paddingLinked) {
      newBanner.paddingTop = updates.padding;
      newBanner.paddingRight = updates.padding;
      newBanner.paddingBottom = updates.padding;
      newBanner.paddingLeft = updates.padding;
    }
    
    set({ banner: newBanner });
    get()._pushHistory();
    get().autoLayout();
  },

  applyPreset: (preset) => {
    set({
      banner: {
        ...get().banner,
        width: preset.width,
        height: preset.height,
        orientation: preset.orientation,
      },
    });
    get()._pushHistory();
    get().autoLayout();
  },

  // --- Item Actions ---
  addItem: (logo) => {
    // Prevent duplicates: check if logo already in editor
    const existing = get().items.find(i => i.logoId === logo.id);
    if (existing) return null;

    const id = `item-${itemIdCounter++}`;
    const item = {
      ...DEFAULT_LOGO_ITEM,
      id,
      logoId: logo.id,
      dataUrl: logo.dataUrl || logo.file_path,
      name: logo.name,
      originalWidth: logo.width || 100,
      originalHeight: logo.height || 100,
      width: logo.width || 100,
      height: logo.height || 100,
    };
    
    set({ items: [...get().items, item] });
    get()._pushHistory();
    get().autoLayout();
    return id;
  },

  isLogoInEditor: (logoId) => {
    return get().items.some(i => i.logoId === logoId);
  },

  removeItem: (itemId) => {
    set({
      items: get().items.filter(i => i.id !== itemId),
      selectedItemId: get().selectedItemId === itemId ? null : get().selectedItemId,
    });
    get()._pushHistory();
    get().autoLayout();
  },

  updateItem: (itemId, updates) => {
    const items = get().items.map(item => {
      if (item.id !== itemId) return item;
      
      const updated = { ...item, ...updates };
      
      // If manually resized, mark as manual override
      if (updates.width !== undefined || updates.height !== undefined || updates.scaleX !== undefined || updates.scaleY !== undefined) {
        updated.manualOverride = true;
      }
      
      // Lock aspect ratio handling
      if (updated.lockAspectRatio && updates.width !== undefined && !updates.height) {
        const ratio = item.originalHeight / item.originalWidth;
        updated.height = Math.round(updates.width * ratio);
      }
      if (updated.lockAspectRatio && updates.height !== undefined && !updates.width) {
        const ratio = item.originalWidth / item.originalHeight;
        updated.width = Math.round(updates.height * ratio);
      }
      
      return updated;
    });
    
    set({ items });
    get()._pushHistory();
  },

  reorderItems: (fromIndex, toIndex) => {
    const items = [...get().items];
    const [item] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, item);
    set({ items });
    get()._pushHistory();
    get().autoLayout();
  },

  selectItem: (itemId) => set({ selectedItemId: itemId }),
  clearSelection: () => set({ selectedItemId: null }),

  // --- Auto Layout Engine ---
  autoLayout: () => {
    const { banner, items } = get();
    if (items.length === 0) return;

    const isHorizontal = banner.orientation === 'horizontal';
    const padT = banner.paddingTop;
    const padR = banner.paddingRight;
    const padB = banner.paddingBottom;
    const padL = banner.paddingLeft;

    const availableWidth = banner.width - padL - padR;
    const availableHeight = banner.height - padT - padB;

    const gap = banner.uniformGap;

    if (isHorizontal) {
      // Calculate total gap space
      const totalGap = Math.max(0, items.length - 1) * gap;

      // Separate manual and auto items
      const manualItems = items.filter(i => i.manualOverride);
      const autoItems = items.filter(i => !i.manualOverride);

      // Space used by manual items
      const manualWidth = manualItems.reduce((sum, i) => sum + (i.width + i.marginLeft + i.marginRight), 0);

      // Calculate auto item sizes: fit to available height, preserve aspect ratio
      const autoSizes = autoItems.map(item => {
        const ratio = item.originalWidth / item.originalHeight;
        const h = availableHeight - item.marginTop - item.marginBottom;
        const w = h * ratio;
        return { w, h };
      });

      // Total natural width of all auto items
      const autoTotal = autoSizes.reduce((sum, s) => sum + s.w, 0);
      const totalNaturalWidth = autoTotal + manualWidth + totalGap;

      // Only scale DOWN if items overflow the available width
      const scale = totalNaturalWidth > availableWidth
        ? (availableWidth - manualWidth - totalGap) / autoTotal
        : 1;

      // Size all items
      const sizedItems = items.map(item => {
        let w, h;
        if (item.manualOverride) {
          w = item.width;
          h = item.height;
        } else {
          const autoIndex = autoItems.indexOf(item);
          w = Math.round(autoSizes[autoIndex].w * scale);
          h = Math.round(autoSizes[autoIndex].h * scale);
        }

        // Vertical alignment (alignItems)
        let y;
        switch (banner.alignItems) {
          case 'start': y = padT + item.marginTop; break;
          case 'end': y = banner.height - padB - h - item.marginBottom; break;
          default: y = padT + (availableHeight - h) / 2; break;
        }

        return { ...item, width: w, height: h, y };
      });

      // Total content width (without padding)
      const contentWidth = sizedItems.reduce((sum, i) => sum + i.width + i.marginLeft + i.marginRight, 0) + totalGap;
      const freeSpace = availableWidth - contentWidth;

      // Position items based on justifyContent
      let currentX;
      let itemGap = gap;

      switch (banner.justifyContent) {
        case 'center':
          currentX = padL + freeSpace / 2;
          break;
        case 'end':
          currentX = padL + freeSpace;
          break;
        case 'space-between':
          currentX = padL;
          if (sizedItems.length > 1) {
            itemGap = (availableWidth - contentWidth + totalGap) / (sizedItems.length - 1);
          }
          break;
        case 'space-evenly':
          if (sizedItems.length > 0) {
            itemGap = (availableWidth - contentWidth + totalGap) / (sizedItems.length + 1);
            currentX = padL + itemGap;
          } else {
            currentX = padL;
          }
          break;
        default: // 'start'
          currentX = padL;
          break;
      }

      const newItems = sizedItems.map(item => {
        const x = currentX + item.marginLeft;
        currentX = x + item.width + item.marginRight + itemGap;
        return { ...item, x };
      });

      set({ items: newItems });

    } else {
      // Vertical layout
      const totalGap = Math.max(0, items.length - 1) * gap;

      const manualItems = items.filter(i => i.manualOverride);
      const autoItems = items.filter(i => !i.manualOverride);

      const manualHeight = manualItems.reduce((sum, i) => sum + (i.height + i.marginTop + i.marginBottom), 0);

      const autoSizes = autoItems.map(item => {
        const ratio = item.originalHeight / item.originalWidth;
        const w = availableWidth - item.marginLeft - item.marginRight;
        const h = w * ratio;
        return { w, h };
      });

      const autoTotal = autoSizes.reduce((sum, s) => sum + s.h, 0);
      const totalNaturalHeight = autoTotal + manualHeight + totalGap;

      // Only scale DOWN if items overflow
      const scale = totalNaturalHeight > availableHeight
        ? (availableHeight - manualHeight - totalGap) / autoTotal
        : 1;

      // Size all items
      const sizedItems = items.map(item => {
        let w, h;
        if (item.manualOverride) {
          w = item.width;
          h = item.height;
        } else {
          const autoIndex = autoItems.indexOf(item);
          w = Math.round(autoSizes[autoIndex].w * scale);
          h = Math.round(autoSizes[autoIndex].h * scale);
        }

        // Horizontal alignment (alignItems)
        let x;
        switch (banner.alignItems) {
          case 'start': x = padL + item.marginLeft; break;
          case 'end': x = banner.width - padR - w - item.marginRight; break;
          default: x = padL + (availableWidth - w) / 2; break;
        }

        return { ...item, width: w, height: h, x };
      });

      // Total content height
      const contentHeight = sizedItems.reduce((sum, i) => sum + i.height + i.marginTop + i.marginBottom, 0) + totalGap;
      const freeSpace = availableHeight - contentHeight;

      let currentY;
      let itemGap = gap;

      switch (banner.justifyContent) {
        case 'center':
          currentY = padT + freeSpace / 2;
          break;
        case 'end':
          currentY = padT + freeSpace;
          break;
        case 'space-between':
          currentY = padT;
          if (sizedItems.length > 1) {
            itemGap = (availableHeight - contentHeight + totalGap) / (sizedItems.length - 1);
          }
          break;
        case 'space-evenly':
          if (sizedItems.length > 0) {
            itemGap = (availableHeight - contentHeight + totalGap) / (sizedItems.length + 1);
            currentY = padT + itemGap;
          } else {
            currentY = padT;
          }
          break;
        default:
          currentY = padT;
          break;
      }

      const newItems = sizedItems.map(item => {
        const y = currentY + item.marginTop;
        currentY = y + item.height + item.marginBottom + itemGap;
        return { ...item, y };
      });

      set({ items: newItems });
    }
  },

  // --- History ---
  _pushHistory: () => {
    const { items, banner, history, historyIndex, maxHistory } = get();
    const snapshot = { items: JSON.parse(JSON.stringify(items)), banner: { ...banner } };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > maxHistory) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({
      items: prev.items,
      banner: prev.banner,
      historyIndex: historyIndex - 1,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({
      items: next.items,
      banner: next.banner,
      historyIndex: historyIndex + 1,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // --- Reset ---
  resetBanner: () => {
    set({
      banner: { ...DEFAULT_BANNER },
      items: [],
      selectedItemId: null,
      history: [],
      historyIndex: -1,
    });
  },
}));
