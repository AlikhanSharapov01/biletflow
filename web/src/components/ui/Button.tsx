import type { ButtonHTMLAttributes } from "react";
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

export function Button({ variant, size, full, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, full, className })} {...rest} />;
}

type ButtonLinkProps = ButtonLook & LinkProps;

export function ButtonLink({ variant, size, full, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, full, className })} {...rest} />;
}
