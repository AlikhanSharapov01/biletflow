import { isNotImplemented } from "../../../api/errors";

// Result of a call to a planned endpoint: either its value, or a marker that
// the backend does not serve it yet. Real failures still throw.
export type Planned<T> = { planned: false; value: T } | { planned: true; value: null };

export async function orPlanned<T>(load: () => Promise<T>): Promise<Planned<T>> {
  try {
    return { planned: false, value: await load() };
  } catch (failure) {
    if (isNotImplemented(failure)) return { planned: true, value: null };
    throw failure;
  }
}
