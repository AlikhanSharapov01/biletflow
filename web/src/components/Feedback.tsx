import type { ReactNode } from "react";

interface LoadingProps {
  label?: string;
}

export function Loading({ label = "Loading…" }: LoadingProps) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-spinner" />
      {label}
    </div>
  );
}

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <section className="panel live-error" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      {onRetry ? (
        <button className="subtle-button" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}

interface EmptyStateProps {
  children: ReactNode;
  wide?: boolean;
}

export function EmptyState({ children, wide = false }: EmptyStateProps) {
  return <div className={`empty-state ${wide ? "wide-empty" : ""}`}>{children}</div>;
}

interface FormMessageProps {
  message: string;
  success?: boolean;
}

export function FormMessage({ message, success = false }: FormMessageProps) {
  return (
    <p className={`form-message ${success ? "success" : ""}`} role="status">
      {message}
    </p>
  );
}
