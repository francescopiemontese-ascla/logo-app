// Database initialization and schema migration for Logo App
// Supports both Tauri (SQLite) and Browser (IndexedDB via Dexie)

import Dexie from 'dexie';

const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#1f6feb',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS logos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    original_format TEXT NOT NULL,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    aspect_ratio REAL DEFAULT 1.0,
    has_transparency INTEGER DEFAULT 1,
    dominant_colors TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    collection_id INTEGER,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    thumbnail_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );`,
  `INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});`,
];

let db = null;

export async function initDatabase() {
  // Try Tauri SQLite first, then fall back to IndexedDB
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    db = await Database.load('sqlite:logo-app.db');
    
    for (const migration of MIGRATIONS) {
      await db.execute(migration);
    }
    
    console.log('Database initialized (Tauri SQLite)');
    return db;
  } catch (error) {
    console.info('Tauri SQL not available, using IndexedDB:', error.message);
    return createIndexedDb();
  }
}

export function getDb() {
  return db;
}

// ============================================================
// IndexedDB adapter via Dexie — persistent browser database
// Exposes the same execute()/select() interface as Tauri SQL
// ============================================================

function createIndexedDb() {
  const dxDb = new Dexie('LogoAppDB');
  dxDb.version(1).stores({
    logos: '++id, name, slug, collection_id, created_at',
    collections: '++id, name',
    projects: '++id, name, updated_at',
  });

  const now = () => new Date().toISOString();

  db = {
    _dexie: dxDb,

    execute: async (query, params = []) => {
      const q = query.trim().toUpperCase();

      // --- INSERT INTO logos ---
      if (q.startsWith('INSERT INTO LOGOS')) {
        const id = await dxDb.logos.add({
          name: params[0],
          slug: params[1],
          original_format: params[2],
          file_path: params[3],
          thumbnail_path: params[4],
          width: params[5] || 0,
          height: params[6] || 0,
          aspect_ratio: params[7] || 1.0,
          has_transparency: params[8] ? 1 : 0,
          dominant_colors: params[9] || '[]',
          tags: params[10] || '[]',
          collection_id: params[11] || null,
          notes: params[12] || '',
          created_at: now(),
          updated_at: now(),
        });
        return { rowsAffected: 1, lastInsertId: id };
      }

      // --- DELETE FROM logos ---
      if (q.startsWith('DELETE FROM LOGOS')) {
        await dxDb.logos.delete(params[0]);
        return { rowsAffected: 1, lastInsertId: 0 };
      }

      // --- UPDATE logos ---
      if (q.startsWith('UPDATE LOGOS') && !q.includes('COLLECTION_ID = NULL')) {
        const id = params[params.length - 1];
        const setMatch = query.match(/SET\s+(.+?)\s+WHERE/is);
        if (setMatch) {
          const updates = {};
          const fields = setMatch[1].split(',').map(f => f.trim());
          let paramIdx = 0;
          for (const field of fields) {
            const eqMatch = field.match(/^(\w+)\s*=/);
            if (eqMatch && !field.includes("datetime('now')")) {
              updates[eqMatch[1]] = params[paramIdx];
              paramIdx++;
            }
          }
          updates.updated_at = now();
          await dxDb.logos.update(id, updates);
        }
        return { rowsAffected: 1, lastInsertId: 0 };
      }

      // --- UPDATE logos SET collection_id = NULL ---
      if (q.includes('COLLECTION_ID = NULL')) {
        const collId = params[0];
        const affected = await dxDb.logos.where('collection_id').equals(collId).modify({ collection_id: null });
        return { rowsAffected: affected, lastInsertId: 0 };
      }

      // --- INSERT INTO collections ---
      if (q.startsWith('INSERT INTO COLLECTIONS')) {
        const id = await dxDb.collections.add({
          name: params[0],
          description: params[1] || '',
          color: params[2] || '#1f6feb',
          created_at: now(),
          updated_at: now(),
        });
        return { rowsAffected: 1, lastInsertId: id };
      }

      // --- DELETE FROM collections ---
      if (q.startsWith('DELETE FROM COLLECTIONS')) {
        await dxDb.collections.delete(params[0]);
        return { rowsAffected: 1, lastInsertId: 0 };
      }

      // --- INSERT INTO projects ---
      if (q.startsWith('INSERT INTO PROJECTS')) {
        const id = await dxDb.projects.add({
          name: params[0],
          data: params[1] || '{}',
          thumbnail_path: null,
          created_at: now(),
          updated_at: now(),
        });
        return { rowsAffected: 1, lastInsertId: id };
      }

      // --- UPDATE projects ---
      if (q.startsWith('UPDATE PROJECTS')) {
        await dxDb.projects.update(params[2], {
          name: params[0],
          data: params[1],
          updated_at: now(),
        });
        return { rowsAffected: 1, lastInsertId: 0 };
      }

      // --- DELETE FROM projects ---
      if (q.startsWith('DELETE FROM PROJECTS')) {
        await dxDb.projects.delete(params[0]);
        return { rowsAffected: 1, lastInsertId: 0 };
      }

      // --- CREATE TABLE / schema migrations — no-op ---
      return { rowsAffected: 0, lastInsertId: 0 };
    },

    select: async (query, params = []) => {
      const q = query.trim().toUpperCase();

      // --- SELECT logos ---
      if (q.includes('FROM LOGOS')) {
        let results = await dxDb.logos.toArray();
        const collections = await dxDb.collections.toArray();
        const collMap = Object.fromEntries(collections.map(c => [c.id, c]));

        results = results.map(l => ({
          ...l,
          collection_name: collMap[l.collection_id]?.name || null,
          collection_color: collMap[l.collection_id]?.color || null,
        }));

        // Handle WHERE ... LIKE for search
        if (q.includes('LIKE') && params[0]) {
          const term = params[0].replace(/%/g, '').toLowerCase();
          results = results.filter(l =>
            l.name.toLowerCase().includes(term) ||
            (l.tags || '').toLowerCase().includes(term) ||
            (l.notes || '').toLowerCase().includes(term)
          );
        }

        results.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        return results;
      }

      // --- SELECT collections ---
      if (q.includes('FROM COLLECTIONS')) {
        const collections = await dxDb.collections.toArray();
        const logos = await dxDb.logos.toArray();
        return collections.map(c => ({
          ...c,
          logo_count: logos.filter(l => l.collection_id === c.id).length,
        }));
      }

      // --- SELECT projects ---
      if (q.includes('FROM PROJECTS')) {
        if (params.length > 0) {
          const p = await dxDb.projects.get(params[0]);
          return p ? [p] : [];
        }
        const all = await dxDb.projects.toArray();
        return all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      }

      return [];
    },
  };

  console.log('[IndexedDB] Persistent database initialized (browser mode)');
  return db;
}

// --- Utility Query Functions ---

export async function insertLogo(logo) {
  const db = getDb();
  if (!db) throw new Error('Database not initialized');
  
  const result = await db.execute(
    `INSERT INTO logos (name, slug, original_format, file_path, thumbnail_path, width, height, aspect_ratio, has_transparency, dominant_colors, tags, collection_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      logo.name,
      logo.slug,
      logo.original_format,
      logo.file_path,
      logo.thumbnail_path || null,
      logo.width || 0,
      logo.height || 0,
      logo.aspect_ratio || 1.0,
      logo.has_transparency ? 1 : 0,
      JSON.stringify(logo.dominant_colors || []),
      JSON.stringify(logo.tags || []),
      logo.collection_id || null,
      logo.notes || '',
    ]
  );
  
  return result.lastInsertId;
}

export async function getAllLogos() {
  const db = getDb();
  if (!db) return [];
  
  const rows = await db.select(
    `SELECT l.*, c.name as collection_name, c.color as collection_color
     FROM logos l
     LEFT JOIN collections c ON l.collection_id = c.id
     ORDER BY l.created_at DESC`
  );
  
  return rows.map(parseLogoRow);
}

export async function searchLogos(query) {
  const db = getDb();
  if (!db) return [];
  
  const searchTerm = `%${query}%`;
  const rows = await db.select(
    `SELECT l.*, c.name as collection_name, c.color as collection_color
     FROM logos l
     LEFT JOIN collections c ON l.collection_id = c.id
     WHERE l.name LIKE $1 OR l.tags LIKE $1 OR l.notes LIKE $1
     ORDER BY l.created_at DESC`,
    [searchTerm]
  );
  
  return rows.map(parseLogoRow);
}

export async function deleteLogo(id) {
  const db = getDb();
  if (!db) return;
  await db.execute('DELETE FROM logos WHERE id = $1', [id]);
}

export async function updateLogo(id, updates) {
  const db = getDb();
  if (!db) return;

  const fields = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = $${paramIndex}`);
    values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    paramIndex++;
  }

  fields.push(`updated_at = datetime('now')`);
  values.push(id);

  await db.execute(
    `UPDATE logos SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function getAllCollections() {
  const db = getDb();
  if (!db) return [];
  
  return db.select(
    `SELECT c.*, COUNT(l.id) as logo_count
     FROM collections c
     LEFT JOIN logos l ON c.id = l.collection_id
     GROUP BY c.id
     ORDER BY c.name`
  );
}

export async function insertCollection(collection) {
  const db = getDb();
  if (!db) return 0;
  
  const result = await db.execute(
    'INSERT INTO collections (name, description, color) VALUES ($1, $2, $3)',
    [collection.name, collection.description || '', collection.color || '#1f6feb']
  );
  
  return result.lastInsertId;
}

export async function deleteCollection(id) {
  const db = getDb();
  if (!db) return;
  await db.execute('UPDATE logos SET collection_id = NULL WHERE collection_id = $1', [id]);
  await db.execute('DELETE FROM collections WHERE id = $1', [id]);
}

// --- Save/Load Projects ---

export async function saveProject(project) {
  const db = getDb();
  if (!db) return 0;

  if (project.id) {
    await db.execute(
      `UPDATE projects SET name = $1, data = $2, updated_at = datetime('now') WHERE id = $3`,
      [project.name, JSON.stringify(project.data), project.id]
    );
    return project.id;
  }

  const result = await db.execute(
    'INSERT INTO projects (name, data) VALUES ($1, $2)',
    [project.name, JSON.stringify(project.data)]
  );
  return result.lastInsertId;
}

export async function getAllProjects() {
  const db = getDb();
  if (!db) return [];
  return db.select('SELECT * FROM projects ORDER BY updated_at DESC');
}

export async function getProject(id) {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select('SELECT * FROM projects WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const row = rows[0];
  row.data = JSON.parse(row.data);
  return row;
}

export async function deleteProject(id) {
  const db = getDb();
  if (!db) return;
  await db.execute('DELETE FROM projects WHERE id = $1', [id]);
}

// --- Helpers ---

function parseLogoRow(row) {
  return {
    ...row,
    has_transparency: Boolean(row.has_transparency),
    dominant_colors: safeJsonParse(row.dominant_colors, []),
    tags: safeJsonParse(row.tags, []),
  };
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
