import { useCallback, useEffect, useState } from "react";
import { getCase } from "../../api/support";
import type { SupportCase } from "../../api/types/support";
import { useRequest } from "../../hooks/useRequest";

// The case header. Staff actions and arriving history items trigger a quiet
// re-read, so the header updates without flashing the loading state.
export function useSupportCase(caseId: string) {
  const request = useRequest(() => getCase(caseId), [caseId]);
  const [current, setCurrent] = useState<SupportCase | null>(null);

  useEffect(() => {
    setCurrent(request.data);
  }, [request.data]);

  const refresh = useCallback(() => {
    getCase(caseId)
      .then(setCurrent)
      .catch(() => undefined);
  }, [caseId]);

  return { supportCase: current, loading: request.loading, error: request.error, reload: request.reload, refresh };
}
