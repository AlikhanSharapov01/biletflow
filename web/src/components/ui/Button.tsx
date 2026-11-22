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
  // A request is in flight. The control stays focusable (a disabled button would
  // drop keyboard focus to <body>) but announces itself busy and ignores activation.
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

type ButtonProps = ButtonLook & ButtonHTMLAttributes<HTMLButtonElement>;

// Wraps a click handler so a busy control swallows activation, including form submission.
function ignoreWhileBusy<E extends MouseEvent>(busy: boolean | undefined, onClick: ((event: E) => void) | undefined) {
  return (event: E) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
}

export function Button({ variant, size, full, className, busy, type = "button", onClick, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, full, className })}
      {...rest}
      {...(busy ? { "aria-busy": true, "aria-disabled": true } : {})}
      onClick={ignoreWhileBusy(busy, onClick)}
    />
  );
}

type ButtonLinkProps = ButtonLook & LinkProps;

export function ButtonLink({ variant, size, full, className, busy, onClick, ...rest }: ButtonLinkProps) {
  return (
    <Link
      className={buttonClass({ variant, size, full, className })}
      {...rest}
      {...(busy ? { "aria-busy": true, "aria-disabled": true } : {})}
      onClick={ignoreWhileBusy(busy, onClick)}
    />
  );
}
