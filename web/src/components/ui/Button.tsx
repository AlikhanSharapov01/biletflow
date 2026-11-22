import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Link, type LinkProps } from "react-router";

// Web versions of mobile's PrimaryButton / SubtleButton / TextButton. The same
// classes style <button> and router <Link>, so both share one helper.
export type ButtonVariant = "primary" | "subtle" | "danger" | "text";

interface ButtonLook {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  full?: boolean;
  className?: string;
}

interface BusyProp {
  // A request is in flight. The control stays focusable (a disabled button would
  // drop keyboard focus to <body>) but announces itself busy and ignores activation.
  // Siblings that must wait meanwhile take aria-disabled instead; they ignore activation too.
  busy?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "primary-button",
  subtle: "subtle-button",
  danger: "subtle-button danger-button",
  text: "text-button",
};

export function buttonClass({ variant = "subtle", size = "md", full = false, className }: ButtonLook): string {
  return [VARIANT_CLASS[variant], size === "sm" ? "compact-action" : "", full ? "full" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonLook & BusyProp & ButtonHTMLAttributes<HTMLButtonElement>;

function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

// Wraps a click handler so a busy or aria-disabled control swallows activation,
// including form submission and link navigation.
function ignoreWhileUnavailable<E extends MouseEvent>(unavailable: boolean, onClick: ((event: E) => void) | undefined) {
  return (event: E) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
}

const BUSY_ATTRIBUTES = { "aria-busy": true, "aria-disabled": true } as const;

const LOCKED_ATTRIBUTES = { "aria-disabled": true } as const;

// Props for a raw <button>: busy while its own request runs (aria-busy + aria-disabled),
// or locked (aria-disabled only) while a sibling's request runs. Both ignore activation.
export function busyProps<E extends MouseEvent>(busy: boolean, onClick?: (event: E) => void, locked = false) {
  return {
    ...(busy ? BUSY_ATTRIBUTES : locked ? LOCKED_ATTRIBUTES : {}),
    onClick: ignoreWhileUnavailable(busy || locked, onClick),
  };
}

export function Button({ variant, size, full, className, busy, type = "button", onClick, ...rest }: ButtonProps) {
  const locked = Boolean(busy) || isTrue(rest["aria-disabled"]);
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, full, className })}
      {...rest}
      {...(busy ? BUSY_ATTRIBUTES : {})}
      onClick={ignoreWhileUnavailable(locked, onClick)}
    />
  );
}

type ButtonLinkProps = ButtonLook & BusyProp & LinkProps;

// A busy link keeps its href, so a middle-click or "open in new tab" still navigates.
export function ButtonLink({ variant, size, full, className, busy, onClick, ...rest }: ButtonLinkProps) {
  const locked = Boolean(busy) || isTrue(rest["aria-disabled"]);
  return (
    <Link
      className={buttonClass({ variant, size, full, className })}
      {...rest}
      {...(busy ? BUSY_ATTRIBUTES : {})}
      onClick={ignoreWhileUnavailable(locked, onClick)}
    />
  );
}
