import React, { useState, useEffect, useRef } from 'react';

export const THEMES = [
  {
    id: 'indigo',
    name: 'Deep Indigo',
    desc: 'Linear & Raycast violet aesthetic',
    icon: '🟣',
    colors: ['#4f46e5', '#8b5cf6', '#f5f6fa'],
  },
  {
    id: 'dark',
    name: 'Midnight Dark',
    desc: 'Cyber obsidian & neon glow',
    icon: '🌙',
    colors: ['#090d16', '#111827', '#60a5fa'],
  },
  {
    id: 'amber',
    name: 'Warm Amber',
    desc: 'Token Vault gold & bronze',
    icon: '🪙',
    colors: ['#d97706', '#f59e0b', '#faf9f6'],
  },
  {
    id: 'emerald',
    name: 'Emerald Mint',
    desc: 'Fresh EduTech teal & mint',
    icon: '🍃',
    colors: ['#059669', '#10b981', '#f0fdf4'],
  },
  {
    id: 'default',
    name: 'Classic Blue',
    desc: 'Clean enterprise slate & azure',
    icon: '🔷',
    colors: ['#2563eb', '#38bdf8', '#f8fafc'],
  },
];

export default function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('smarttoken_theme') || 'indigo';
    }
    return 'indigo';
  });
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Sync theme attribute to document on mount & change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('smarttoken_theme', currentTheme);
  }, [currentTheme]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeThemeObj = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  const handleSelectTheme = (themeId) => {
    setCurrentTheme(themeId);
    setIsOpen(false);
  };

  return (
    <div className="theme-switcher-wrapper" ref={containerRef}>
      <button
        type="button"
        className="theme-switcher-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Change Visual Color Scheme & Theme"
        aria-label="Theme switcher menu"
        aria-expanded={isOpen}
      >
        <span className="theme-btn-icon">{activeThemeObj.icon}</span>
        <span className="theme-btn-label">{activeThemeObj.name}</span>
        <span className="theme-btn-arrow">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="theme-dropdown-menu">
          <div className="theme-dropdown-header">
            <span>Color Scheme & Theme</span>
          </div>
          <div className="theme-options-list">
            {THEMES.map((t) => {
              const isSelected = t.id === currentTheme;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-option-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectTheme(t.id)}
                >
                  <div className="theme-option-left">
                    <span className="theme-option-icon">{t.icon}</span>
                    <div className="theme-option-text">
                      <span className="theme-option-name">{t.name}</span>
                      <span className="theme-option-desc">{t.desc}</span>
                    </div>
                  </div>
                  <div className="theme-option-right">
                    <div className="theme-swatch-dots">
                      {t.colors.map((c, i) => (
                        <span
                          key={i}
                          className="theme-swatch-dot"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    {isSelected && <span className="theme-check">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
