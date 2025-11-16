/**
 * Keyboard Shortcuts Panel Component
 *
 * Displays available keyboard shortcuts in a modal dialog
 * Automatically shows on first visit and can be toggled with ?
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatShortcut } from '@/hooks/useKeyboardShortcuts';

export interface Shortcut {
  key: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category?: string;
}

interface KeyboardShortcutsPanelProps {
  shortcuts: Shortcut[];
  showOnFirstVisit?: boolean;
}

const STORAGE_KEY = 'interview-shortcuts-seen';

export function KeyboardShortcutsPanel({
  shortcuts,
  showOnFirstVisit = true,
}: KeyboardShortcutsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Show on first visit
    if (showOnFirstVisit && typeof window !== 'undefined') {
      const hasSeenBefore = localStorage.getItem(STORAGE_KEY);
      if (!hasSeenBefore) {
        setIsOpen(true);
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    }

    // Listen for ? key to toggle
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Don't trigger if user is typing in an input/textarea
        if (
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          !target.isContentEditable
        ) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [showOnFirstVisit]);

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-colors z-50"
        title="Keyboard shortcuts (Press ?)"
      >
        <Keyboard className="h-5 w-5" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Use these shortcuts to navigate faster. Press{' '}
              <kbd className="px-2 py-1 text-xs font-semibold text-text-primary bg-background border border-border rounded">
                ?
              </kbd>{' '}
              to toggle this panel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wide mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded hover:bg-surface-hover"
                    >
                      <span className="text-sm text-text-secondary">
                        {shortcut.description}
                      </span>
                      <kbd className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-semibold text-text-primary bg-background border border-border rounded shadow-sm">
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs text-text-tertiary text-center">
              💡 Tip: You can always press{' '}
              <kbd className="px-2 py-0.5 text-xs font-mono font-semibold text-text-primary bg-background border border-border rounded">
                ?
              </kbd>{' '}
              to view this panel again
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Default interview keyboard shortcuts for display
 */
export const defaultInterviewShortcuts: Shortcut[] = [
  {
    key: 's',
    ctrlOrMeta: true,
    description: 'Save current file',
    category: 'Editor',
  },
  {
    key: 'Enter',
    ctrlOrMeta: true,
    description: 'Run tests',
    category: 'Testing',
  },
  {
    key: '/',
    ctrlOrMeta: true,
    description: 'Toggle AI chat panel',
    category: 'Navigation',
  },
  {
    key: 'b',
    ctrlOrMeta: true,
    shift: true,
    description: 'Format code (experimental)',
    category: 'Editor',
  },
  {
    key: 'Enter',
    ctrlOrMeta: true,
    shift: true,
    description: 'Submit assessment',
    category: 'Assessment',
  },
  {
    key: '?',
    description: 'Show keyboard shortcuts',
    category: 'Help',
  },
];
