import { useState, useEffect } from 'react';
import { subscribeSyncState, syncNow, PROMPT_SYNC_MS } from '../utils/syncManager.js';
import ThemeSwitcher from './ThemeSwitcher.jsx';

export default function Header() {
  const [syncState, setSyncState] = useState({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    permanentErrorsCount: 0,
    authExpired: false,
    lastSyncTime: null,
  });
  const [showSlowSync, setShowSlowSync] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let timer = null;
    // In online mode, delay the syncing/pending indicator to prevent flicker for prompt requests
    if (syncState.isOnline && (syncState.isSyncing || syncState.pendingCount > 0)) {
      timer = setTimeout(() => {
        setShowSlowSync(true);
      }, PROMPT_SYNC_MS);
    } else {
      setShowSlowSync(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [syncState.isOnline, syncState.isSyncing, syncState.pendingCount]);

  const handleManualSync = () => {
    setShowSlowSync(true);
    syncNow();
  };

  return (
    <header className="header">
      <div className="header-brand">
        <div className="brand-logo-container">
          <span className="brand-logo">🪙</span>
        </div>
        <div className="brand-text-group">
          <h1 className="brand-title">SmartToken</h1>
          <span className="brand-section-tag">CS 101 • Section A</span>
        </div>
        <span className="portal-badge">Faculty Portal</span>
      </div>

      <div className="header-actions">
        <ThemeSwitcher />
        {syncState.authExpired ? (
          <div className="status-indicator auth-expired" title="Authentication expired. Actions preserved locally in queue.">
            <span className="status-dot"></span>
            <span>⚠️ Auth Expired • Please log in to sync</span>
          </div>
        ) : !syncState.isOnline ? (
          <div
            className={`status-indicator ${syncState.hasInternet ? 'offline server-disconnected' : 'offline'}`}
            title={
              syncState.hasInternet
                ? 'Your device has internet, but the SmartToken backend server (port 3001) is unreachable. Changes are safely saved locally in IndexedDB.'
                : 'Working offline without internet. Changes are saved locally and will sync when reconnected.'
            }
          >
            <span className="status-dot"></span>
            <span>{syncState.hasInternet ? 'Server Disconnected (Local Mode)' : 'Offline (Local Mode)'}</span>
            {syncState.pendingCount > 0 && (
              <span style={{ fontWeight: 600, marginLeft: '0.25rem' }}>
                • {syncState.pendingCount} queued
              </span>
            )}
            <button
              className="sync-now-btn"
              onClick={handleManualSync}
              title="Test connection and attempt sync"
            >
              Retry
            </button>
          </div>
        ) : (syncState.isSyncing || syncState.pendingCount > 0) && !showSlowSync ? (
          <div className="status-indicator online">
            <span className="status-dot"></span>
            <span>Online • Ledger Synced</span>
          </div>
        ) : syncState.isSyncing ? (
          <div className="status-indicator syncing">
            <span className="status-dot"></span>
            <span>Syncing ({syncState.pendingCount} pending)...</span>
          </div>
        ) : syncState.pendingCount > 0 ? (
          <div className="status-indicator pending">
            <span className="status-dot"></span>
            <span>{syncState.pendingCount} queued locally</span>
            <button
              className="sync-now-btn"
              onClick={handleManualSync}
              title="Sync queued changes with server ledger"
            >
              Sync Now
            </button>
          </div>
        ) : syncState.permanentErrorsCount > 0 ? (
          <div className="status-indicator auth-expired">
            <span className="status-dot"></span>
            <span>{syncState.permanentErrorsCount} rejected by server</span>
          </div>
        ) : (
          <div className="status-indicator online">
            <span className="status-dot"></span>
            <span>Online • Ledger Synced</span>
          </div>
        )}
      </div>
    </header>
  );
}
