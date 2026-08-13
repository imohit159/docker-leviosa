"use client";

import { type HTMLAttributes } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type GlowingBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

interface GlowingBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: GlowingBadgeVariant;
  pulse?: boolean;
  dot?: boolean;
}

/**
 * Retuned for Leviosa: the upstream variants ship saturated filled pills straight from
 * the Tailwind palette, which bypasses the theme and shouts on a dense grid. These read
 * as soft status chips built from the domain tokens, so they restate the same semantics
 * as `ui/badge` and follow the colour scheme. The pulsing dot is kept — on a polling
 * dashboard it is the only thing on screen that says "this is live".
 */
const variantStyles: Record<
  GlowingBadgeVariant,
  { badge: string; glow: string; dot: string }
> = {
  default: {
    badge: "bg-muted text-foreground ring-1 ring-inset ring-border",
    glow: "bg-foreground/10",
    dot: "bg-foreground",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    glow: "bg-foreground/10",
    dot: "bg-muted-foreground",
  },
  success: {
    badge: "bg-ok-soft text-ok ring-1 ring-inset ring-ok-line",
    glow: "bg-ok/20",
    dot: "bg-ok",
  },
  warning: {
    badge: "bg-warn-soft text-warn ring-1 ring-inset ring-warn-line",
    glow: "bg-warn/20",
    dot: "bg-warn",
  },
  error: {
    badge: "bg-danger-soft text-danger ring-1 ring-inset ring-danger-line",
    glow: "bg-danger/20",
    dot: "bg-danger",
  },
  info: {
    badge: "bg-brand-soft text-brand ring-1 ring-inset ring-brand-line",
    glow: "bg-brand/20",
    dot: "bg-brand",
  },
};

function GlowingBadge({
  variant = "default",
  pulse = true,
  dot = true,
  children,
  className,
  ...props
}: GlowingBadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span className="relative inline-flex">
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full opacity-60 blur-md",
          styles.glow,
        )}
      />
      <span
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          styles.badge,
          className,
        )}
        {...props}
      >
        {dot && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {pulse && (
              <motion.span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  styles.dot,
                )}
                animate={{ scale: [1, 2.5, 1], opacity: [0.75, 0, 0.75] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}
            <span
              className={cn(
                "relative inline-flex h-1.5 w-1.5 rounded-full",
                styles.dot,
              )}
            />
          </span>
        )}
        {children}
      </span>
    </span>
  );
}

export { GlowingBadge };
export type { GlowingBadgeProps, GlowingBadgeVariant };
