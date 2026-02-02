import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';

export function useKeyboardShortcuts() {
  const { 
    setCommandPaletteOpen, 
    toggleSidebar,
    toggleInspector,
  } = useAppStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    // Cmd/Ctrl + K - Command palette
    if (modifier && e.key === 'k') {
      e.preventDefault();
      setCommandPaletteOpen(true);
    }

    // Cmd/Ctrl + / - Focus composer
    if (modifier && e.key === '/') {
      e.preventDefault();
      const composer = document.querySelector('[data-composer-input]') as HTMLTextAreaElement;
      composer?.focus();
    }

    // Cmd/Ctrl + B - Toggle sidebar
    if (modifier && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }

    // Cmd/Ctrl + I - Toggle inspector
    if (modifier && e.key === 'i') {
      e.preventDefault();
      toggleInspector();
    }

    // Escape - Close modals/panels
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
  }, [setCommandPaletteOpen, toggleSidebar, toggleInspector]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
