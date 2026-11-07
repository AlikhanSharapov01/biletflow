import type { ReactNode } from "react";
import { Button } from "./Button";

// Loading, error, empty and form-message states, sized like mobile's ui/States.

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
    <section className="panel error-panel" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </section>
  );
}

interface EmptyStateProps {
  children: ReactNode;
  // Spans a whole card grid with a dashed outline.
  wide?: boolean;
}

export function EmptyState({ children, wide = false }: EmptyStateProps) {
  return <div className={`empty-state ${wide ? "empty-wide" : ""}`}>{children}</div>;
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
