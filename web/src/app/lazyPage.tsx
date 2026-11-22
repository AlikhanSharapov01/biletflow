import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { ErrorPanel, Loading } from "../components/ui";
import { t, useLocale } from "../i18n";

// Route-level code splitting: the page module loads on first visit. The
// fallback and the error panel render in place, so the surrounding shell
// (top bar, admin sidebar) stays on screen.

function ChunkLoadError() {
  useLocale();
  return (
    <ErrorPanel
      title={t("errors.chunk_load_title")}
      message={t("errors.chunk_load")}
      onRetry={() => window.location.reload()}
    />
  );
}

interface BoundaryState {
  failed: boolean;
}

class LazyBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <ChunkLoadError /> : this.props.children;
  }
}

export function lazyPage(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Page = lazy(load);
  return function LazyPage() {
    return (
      <LazyBoundary>
        <Suspense fallback={<Loading />}>
          <Page />
        </Suspense>
      </LazyBoundary>
    );
  };
}
