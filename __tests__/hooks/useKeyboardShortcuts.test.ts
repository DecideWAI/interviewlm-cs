/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import {
  useKeyboardShortcuts,
  useInterviewKeyboardShortcuts,
  formatShortcut,
} from '@/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let mockHandler1: jest.Mock;
  let mockHandler2: jest.Mock;

  beforeEach(() => {
    mockHandler1 = jest.fn();
    mockHandler2 = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should register keyboard shortcuts', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      expect(result.current.shortcuts).toHaveLength(1);
      expect(result.current.shortcuts[0].description).toBe('Save');
    });

    it('should trigger handler on correct key combination', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).toHaveBeenCalledTimes(1);
    });

    it('should not trigger handler without modifier key', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive keys', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'S', // Uppercase
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).toHaveBeenCalled();
    });
  });

  describe('Modifier Keys', () => {
    it('should handle Ctrl key', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).toHaveBeenCalled();
    });

    it('should handle Meta key (Cmd on Mac)', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).toHaveBeenCalled();
    });

    it('should handle Shift modifier', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 'Enter',
              ctrlOrMeta: true,
              shift: true,
              description: 'Submit',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).toHaveBeenCalled();
    });

    it('should not trigger if shift is required but not pressed', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 'Enter',
              ctrlOrMeta: true,
              shift: true,
              description: 'Submit',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        // shiftKey not set
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).not.toHaveBeenCalled();
    });

    it('should handle Alt modifier', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 'f',
              alt: true,
              description: 'Alt+F',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'f',
        altKey: true,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(mockHandler1).toHaveBeenCalled();
    });
  });

  describe('Multiple Shortcuts', () => {
    it('should handle multiple shortcuts', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
            {
              key: 'o',
              ctrlOrMeta: true,
              description: 'Open',
              handler: mockHandler2,
            },
          ],
        })
      );

      // Trigger first shortcut
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Trigger second shortcut
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'o',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockHandler1).not.toHaveBeenCalled();
      expect(mockHandler2).toHaveBeenCalledTimes(1);
    });

    it('should only trigger first matching shortcut', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save 1',
              handler: mockHandler1,
            },
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save 2',
              handler: mockHandler2,
            },
          ],
        })
      );

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).not.toHaveBeenCalled();
    });
  });

  describe('PreventDefault', () => {
    it('should prevent default by default', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      act(() => {
        document.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not prevent default if preventDefault is false', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
              preventDefault: false,
            },
          ],
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      act(() => {
        document.dispatchEvent(event);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(mockHandler1).toHaveBeenCalled();
    });
  });

  describe('Enabled/Disabled', () => {
    it('should not register shortcuts when disabled', () => {
      const { rerender } = renderHook(
        ({ enabled }) =>
          useKeyboardShortcuts({
            shortcuts: [
              {
                key: 's',
                ctrlOrMeta: true,
                description: 'Save',
                handler: mockHandler1,
              },
            ],
            enabled,
          }),
        { initialProps: { enabled: false } }
      );

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockHandler1).not.toHaveBeenCalled();

      // Enable shortcuts
      rerender({ enabled: true });

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockHandler1).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts({
          shortcuts: [
            {
              key: 's',
              ctrlOrMeta: true,
              description: 'Save',
              handler: mockHandler1,
            },
          ],
        })
      );

      unmount();

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockHandler1).not.toHaveBeenCalled();
    });
  });
});

describe('useInterviewKeyboardShortcuts', () => {
  it('should create interview-specific shortcuts', () => {
    const handlers = {
      onSave: jest.fn(),
      onRunTests: jest.fn(),
      onToggleAIChat: jest.fn(),
    };

    const { result } = renderHook(() => useInterviewKeyboardShortcuts(handlers));

    expect(result.current.shortcuts.length).toBeGreaterThan(0);
  });

  it('should only include shortcuts with handlers', () => {
    const handlers = {
      onSave: jest.fn(),
      // Other handlers undefined
    };

    const { result } = renderHook(() => useInterviewKeyboardShortcuts(handlers));

    // Should only include Save shortcut
    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].description).toContain('Save');
  });
});

describe('formatShortcut', () => {
  // Mock navigator.platform
  const originalPlatform = navigator.platform;

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  it('should format Ctrl+S on Windows', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });

    const formatted = formatShortcut({ key: 's', ctrlOrMeta: true });
    expect(formatted).toBe('Ctrl+S');
  });

  it('should format ⌘+S on Mac', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
    });

    const formatted = formatShortcut({ key: 's', ctrlOrMeta: true });
    expect(formatted).toBe('⌘+S');
  });

  it('should format Shift modifier', () => {
    const formatted = formatShortcut({
      key: 'Enter',
      ctrlOrMeta: true,
      shift: true,
    });

    expect(formatted).toContain('Shift');
    expect(formatted).toContain('ENTER');
  });

  it('should format Alt modifier', () => {
    const formatted = formatShortcut({ key: 'f', alt: true });

    expect(formatted).toContain('Alt');
    expect(formatted).toContain('F');
  });

  it('should uppercase key', () => {
    const formatted = formatShortcut({ key: 's', ctrlOrMeta: true });

    expect(formatted).toMatch(/S$/);
  });
});
