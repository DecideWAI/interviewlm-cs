/**
 * Device Detection Utilities
 */

/**
 * Detect if device is mobile based on screen size and user agent
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // Check screen width (tablets at 768px+, phones < 768px)
  const isSmallScreen = window.innerWidth < 768;

  // Check user agent for mobile devices
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android',
    'webos',
    'iphone',
    'ipad',
    'ipod',
    'blackberry',
    'windows phone',
  ];
  const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));

  // Also check for touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Device is mobile if it has small screen AND (mobile UA OR touch)
  return isSmallScreen && (isMobileUA || hasTouch);
}

/**
 * Get device type description
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;

  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Hook to detect mobile device with reactive updates
 */
import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Initial check
    setIsMobile(isMobileDevice());
    setIsChecking(false);

    // Listen for resize events
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return { isMobile, isChecking };
}
