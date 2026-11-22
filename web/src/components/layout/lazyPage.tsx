import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { ErrorPanel, Loading } from "../ui";
import { t, useLocale } from "../../i18n";

// Route-level code splitting: the page module loads on first visit. The
// fallback and the error panel render in place, so the surrounding shell
// (top bar, admin sidebar) stays on screen.

const CHUNK_FAILURE = /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i;

function isChunkLoadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return CHUNK_FAILURE.test(error.name) || CHUNK_FAILURE.test(error.message);
}

interface BoundaryState {
  error: Error | null;
}

class LazyBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <LoadFailure chunk={isChunkLoadFailure(error)} onReset={() => this.setState({ error: null })} />;
  }
}

function LoadFailure({ chunk, onReset }: { chunk: boolean; onReset: () => void }) {
  useLocale();
  // After a deploy the old chunk is gone: only a reload fetches the new build.
  return chunk ? (
    <ErrorPanel
      title={t("errors.chunk_load_title")}
      message={t("errors.chunk_load")}
      retryLabel={t("common.reload_page")}
      onRetry={() => window.location.reload()}
    />
  ) : (
    <ErrorPanel title={t("errors.chunk_load_title")} message={t("errors.generic")} onRetry={onReset} />
  );
}

export function lazyPage<Module>(
  load: () => Promise<Module>,
  pick: (module: Module) => ComponentType,
): ComponentType {
  const Page = lazy(() => load().then((module) => ({ default: pick(module) })));
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
