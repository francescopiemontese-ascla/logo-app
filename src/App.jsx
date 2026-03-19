import React, { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { useLogoStore } from './store/logoStore';
import { useEditorStore } from './store/editorStore';
import { initDatabase } from './utils/database';
import LogoLibrary from './components/library/LogoLibrary';
import BannerEditor from './components/editor/BannerEditor';
import BatchApply from './components/batch/BatchApply';
import GenerateDocs from './components/generate/GenerateDocs';
import {
  Image, PenTool, Layers, FileOutput, Moon, Sun,
} from 'lucide-react';
import './styles/index.css';

export default function App() {
  const { activeTab, setActiveTab, theme, toggleTheme, dbReady, setDbReady, notification } = useAppStore();
  const loadLogos = useLogoStore(s => s.loadLogos);
  const loadCollections = useLogoStore(s => s.loadCollections);
  const items = useEditorStore(s => s.items);

  // Initialize database on mount
  useEffect(() => {
    async function init() {
      await initDatabase();
      setDbReady(true);
      await loadLogos();
      await loadCollections();
    }
    init().catch(console.error);
  }, [setDbReady, loadLogos, loadCollections]);

  // Set initial theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  const tabs = [
    { id: 'library', label: 'Libreria', icon: Image },
    { id: 'editor', label: 'Editor Fascette', icon: PenTool },
    { id: 'batch', label: 'Applica', icon: Layers },
    { id: 'generate', label: 'Genera', icon: FileOutput },
  ];

  return (
    <div className="app">
      {/* Header */}
      <header className="app__header">
        <div className="app__header-left">
          <h1 className="app__title">Logo App</h1>
        </div>

        <div className="app__header-center">
          <nav className="nav-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`nav-tab ${activeTab === tab.id ? 'nav-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon className="nav-tab__icon" />
                {tab.label}
                {tab.id === 'editor' && items.length > 0 && (
                  <span className="badge badge--accent" style={{ marginLeft: 4 }}>
                    {items.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="app__header-right">
          <button
            className="btn btn--ghost btn--icon tooltip"
            data-tooltip={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="app__body">
        {!dbReady ? (
          <div className="empty-state">
            <div style={{ 
              width: 40, height: 40, border: '3px solid var(--border-default)', 
              borderTopColor: 'var(--accent-primary)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <p className="text-sm text-muted">Inizializzazione database...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            {activeTab === 'library' && <LogoLibrary />}
            {activeTab === 'editor' && <BannerEditor />}
            {activeTab === 'batch' && <BatchApply />}
            {activeTab === 'generate' && <GenerateDocs />}
          </>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          padding: 'var(--space-3) var(--space-5)',
          background: notification.type === 'error' ? 'var(--accent-danger)' : 
                      notification.type === 'success' ? 'var(--accent-success)' : 'var(--accent-primary)',
          color: '#fff',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-medium)',
          zIndex: 1001,
          animation: 'slideUp 0.2s ease',
          maxWidth: 400,
        }}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
