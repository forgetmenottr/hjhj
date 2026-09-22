// Small shared building blocks: buttons, cards, badges, icons.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ctp-mauve text-ctp-crust hover:bg-ctp-lavender disabled:bg-ctp-surface1 disabled:text-ctp-subtext",
  secondary: "bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1 disabled:text-ctp-subtext",
  ghost: "text-ctp-subtext hover:bg-ctp-surface0 hover:text-ctp-text",
  danger: "text-ctp-red hover:bg-ctp-surface0",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** On/off button (aria-pressed); "on" is filled mauve, and callers also change its icon. */
export function ToggleButton({
  pressed,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  const look = pressed ? "bg-ctp-mauve text-ctp-crust hover:bg-ctp-lavender" : "bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${look} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4 md:p-5 ${className}`}>{children}</section>;
}

type Tone = "neutral" | "red" | "yellow" | "green" | "blue" | "peach" | "mauve";

const TONES: Record<Tone, string> = {
  neutral: "bg-ctp-surface0 text-ctp-text",
  red: "bg-ctp-red/15 text-ctp-red",
  yellow: "bg-ctp-yellow/15 text-ctp-yellow",
  green: "bg-ctp-green/15 text-ctp-green",
  blue: "bg-ctp-blue/15 text-ctp-blue",
  peach: "bg-ctp-peach/15 text-ctp-peach",
  mauve: "bg-ctp-mauve/15 text-ctp-mauve",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (decorative; buttons carry their own labels).
// ---------------------------------------------------------------------------

function Svg({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const ChevronIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const CheckIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
export const AlertIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
  </Svg>
);
export const InfoIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);
export const PlusIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const RefreshIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
  </Svg>
);
export const LockIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const UnlockIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.8-1.2" />
  </Svg>
);
export const BanIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.7 5.7 12.6 12.6" />
  </Svg>
);

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={`spinner ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
