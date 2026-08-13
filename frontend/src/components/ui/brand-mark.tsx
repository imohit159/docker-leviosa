import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The product mark — the levitating container tile, same asset as the favicon
 * (`public/logo.png` is a copy of `src/app/icon.png`). One component so the
 * sidebar, the landing nav and anything future render the identical mark.
 *
 * Decorative by default: it always sits next to the "Leviosa" wordmark, so the
 * image itself has nothing to add for a screen reader.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      aria-hidden
      width={64}
      height={64}
      className={cn('size-8 shrink-0 rounded-lg', className)}
    />
  );
}
