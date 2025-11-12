/**
 * Custom hook for managing keyboard shortcuts
 *
 * Provides a consistent way to handle keyboard shortcuts across the application
 * with proper cleanup and conflict prevention.
 */

import { useEffect, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlOrMeta?: boolean; // Ctrl on Windows/Linux, Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  description: string;
  handler: (event: KeyboardEvent) => void;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook to register keyboard shortcuts
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts({
 *   shortcuts: [
 *     {
 *       key: 's',
 *       ctrlOrMeta: true,
 *       description: 'Save file',
 *       handler: () => saveFile(),
 *     },
 *     {
 *       key: 'Enter',
 *       ctrlOrMeta: true,
 *       description: 'Run tests',
 *       handler: () => runTests(),
 *     },
 *   ],
 * });
 * ```
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  // Use ref to avoid recreating handler on every render
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcuts = shortcutsRef.current;

      for (const shortcut of shortcuts) {
        // Check if all modifiers match
        const ctrlOrMetaMatch = shortcut.ctrlOrMeta
          ? (event.ctrlKey || event.metaKey)
          : !(event.ctrlKey || event.metaKey);

        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        // Check if key matches (case-insensitive)
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (keyMatch && ctrlOrMetaMatch && shiftMatch && altMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler(event);
          break; // Only trigger one shortcut per keypress
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);

  return {
    shortcuts: shortcuts.map(s => ({
      key: s.key,
      modifiers: [
        s.ctrlOrMeta && (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'),
        s.shift && 'Shift',
        s.alt && 'Alt',
      ].filter(Boolean).join('+'),
      description: s.description,
    })),
  };
}

/**
 * Common keyboard shortcuts for interview page
 */
export function useInterviewKeyboardShortcuts(handlers: {
  onSave?: () => void;
  onRunTests?: () => void;
  onToggleAIChat?: () => void;
  onSubmit?: () => void;
  onFormatCode?: () => void;
}) {
  return useKeyboardShortcuts({
    shortcuts: [
      {
        key: 's',
        ctrlOrMeta: true,
        description: 'Save current file',
        handler: () => handlers.onSave?.(),
      },
      {
        key: 'Enter',
        ctrlOrMeta: true,
        description: 'Run tests',
        handler: () => handlers.onRunTests?.(),
      },
      {
        key: '/',
        ctrlOrMeta: true,
        description: 'Toggle AI chat',
        handler: () => handlers.onToggleAIChat?.(),
      },
      {
        key: 'b',
        ctrlOrMeta: true,
        shift: true,
        description: 'Format code',
        handler: () => handlers.onFormatCode?.(),
      },
      {
        key: 'Enter',
        ctrlOrMeta: true,
        shift: true,
        description: 'Submit assessment',
        handler: () => handlers.onSubmit?.(),
      },
    ].filter(shortcut =>
      // Only include shortcuts that have handlers
      shortcut.key === 's' && handlers.onSave ||
      shortcut.key === 'Enter' && !shortcut.shift && handlers.onRunTests ||
      shortcut.key === '/' && handlers.onToggleAIChat ||
      shortcut.key === 'b' && handlers.onFormatCode ||
      shortcut.key === 'Enter' && shortcut.shift && handlers.onSubmit
    ),
  });
}

/**
 * Format shortcut for display
 *
 * @example
 * ```tsx
 * formatShortcut({ key: 's', ctrlOrMeta: true })
 * // => "Ctrl+S" on Windows/Linux, "⌘S" on Mac
 * ```
 */
export function formatShortcut(shortcut: {
  key: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
}): string {
  const parts: string[] = [];

  if (shortcut.ctrlOrMeta) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }
  if (shortcut.alt) {
    parts.push('Alt');
  }

  parts.push(shortcut.key.toUpperCase());

  return parts.join('+');
}
