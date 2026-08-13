'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the client is an Apple platform, resolved after mount.
 *
 * It deliberately starts `false` so the server render and the first client render agree
 * — the value is only used to pick a keyboard glyph, and a hydration mismatch is a far
 * worse trade than one frame showing "Ctrl" on a Mac.
 */
export function useIsApplePlatform(): boolean {
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    setIsApple(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);

  return isApple;
}

/** Display glyph for the primary chord modifier on this platform. */
export function useModifierKeyLabel(): string {
  return useIsApplePlatform() ? '⌘' : 'Ctrl';
}
