"use client";

import {
  Turnstile as TurnstileWidget,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import {
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
} from "react";

export interface TurnstileRef {
  /**
   * Get the current Turnstile token
   * Returns a promise that resolves when the token is ready
   */
  getToken: () => Promise<string | null>;
  /**
   * Reset the widget to get a fresh token
   */
  reset: () => void;
}

interface TurnstileProps {
  /**
   * Callback when verification succeeds
   */
  onSuccess?: (token: string) => void;
  /**
   * Callback when verification fails
   */
  onError?: (error: Error) => void;
  /**
   * Callback when token expires
   */
  onExpire?: () => void;
  /**
   * Action name for analytics (e.g., "signup", "signin")
   */
  action?: string;
}

/**
 * Invisible Turnstile component for bot protection
 *
 * Usage:
 * ```tsx
 * const turnstileRef = useRef<TurnstileRef>(null);
 *
 * const handleSubmit = async () => {
 *   const token = await turnstileRef.current?.getToken();
 *   if (!token) {
 *     // Handle missing token - show error
 *     return;
 *   }
 *   // Submit with token in body or header
 * };
 *
 * <Turnstile ref={turnstileRef} action="signup" />
 * ```
 */
export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
  ({ onSuccess, onError, onExpire, action }, ref) => {
    const widgetRef = useRef<TurnstileInstance | null>(null);
    const tokenRef = useRef<string | null>(null);
    const resolveRef = useRef<((token: string | null) => void) | null>(null);
    const [isDevMode, setIsDevMode] = useState(false);

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    // Check if we're in dev mode (no site key)
    useEffect(() => {
      if (!siteKey) {
        setIsDevMode(true);
      }
    }, [siteKey]);

    const handleSuccess = useCallback(
      (token: string) => {
        tokenRef.current = token;
        if (resolveRef.current) {
          resolveRef.current(token);
          resolveRef.current = null;
        }
        onSuccess?.(token);
      },
      [onSuccess]
    );

    const handleError = useCallback(() => {
      tokenRef.current = null;
      if (resolveRef.current) {
        resolveRef.current(null);
        resolveRef.current = null;
      }
      onError?.(new Error("Turnstile verification failed"));
    }, [onError]);

    const handleExpire = useCallback(() => {
      tokenRef.current = null;
      onExpire?.();
    }, [onExpire]);

    useImperativeHandle(
      ref,
      () => ({
        getToken: async () => {
          // Dev mode: return mock token
          if (isDevMode) {
            return "dev-mode-token";
          }

          // If we already have a valid token, return it
          if (tokenRef.current) {
            return tokenRef.current;
          }

          // Wait for token (invisible widget auto-executes)
          return new Promise((resolve) => {
            resolveRef.current = resolve;

            // Trigger widget execution if needed
            widgetRef.current?.execute();

            // Timeout after 30 seconds
            setTimeout(() => {
              if (resolveRef.current) {
                resolveRef.current(null);
                resolveRef.current = null;
              }
            }, 30000);
          });
        },
        reset: () => {
          tokenRef.current = null;
          if (!isDevMode) {
            widgetRef.current?.reset();
          }
        },
      }),
      [isDevMode]
    );

    // If no site key, don't render widget (dev mode)
    if (!siteKey) {
      return null;
    }

    return (
      <TurnstileWidget
        ref={widgetRef}
        siteKey={siteKey}
        options={{
          size: "invisible",
          action,
          theme: "dark",
        }}
        onSuccess={handleSuccess}
        onError={handleError}
        onExpire={handleExpire}
      />
    );
  }
);

Turnstile.displayName = "Turnstile";
