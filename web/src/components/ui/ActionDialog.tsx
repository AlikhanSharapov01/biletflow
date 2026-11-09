import { t, useLocale } from "../../i18n";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { TextAreaField } from "./Field";

interface DialogRequest {
  message: string;
  reason: boolean;
  resolve: (value: string | null) => void;
}

let pending: DialogRequest | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => pending;
function finish(value: string | null) {
  const request = pending;
  pending = null;
  listeners.forEach((listener) => listener());
  request?.resolve(value);
}

/** One destructive action at a time; a second request never replaces the first. */
function ask(message: string, reason: boolean): Promise<string | null> {
  if (pending) return Promise.resolve(null);
  return new Promise((resolve) => {
    pending = { message, reason, resolve };
    listeners.forEach((listener) => listener());
  });
}

export async function confirmAction(message: string): Promise<boolean> {
  return (await ask(message, false)) !== null;
}

export function requestReason(message: string): Promise<string | null> {
  return ask(message, true);
}

function Dialog({ request }: { request: DialogRequest }) {
  useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState("");

  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={ref} className="action-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); finish(null); }}>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        if (!request.reason || reason.trim()) finish(request.reason ? reason.trim() : "confirmed");
      }}>
        <h2 id={titleId}>{t("common.confirm_action")}</h2>
        <p id={descriptionId}>{request.message}</p>
        {request.reason ? <TextAreaField label={t("common.reason_history")} required maxLength={500}
          value={reason} onChange={(event) => setReason(event.target.value)} /> : null}
        <div className="form-actions">
          <Button type="button" autoFocus onClick={() => finish(null)}>{t("common.cancel")}</Button>
          <Button type="submit" variant="danger" disabled={request.reason && !reason.trim()}>{t("common.confirm")}</Button>
        </div>
      </form>
    </dialog>, document.body,
  );
}

/** Native modal dialog supplies focus containment, background inertness and Escape. */
export function ActionDialogHost() {
  useLocale();
  const request = useSyncExternalStore(subscribe, snapshot, () => null);
  useEffect(() => () => finish(null), []);
  return request ? <Dialog request={request} /> : null;
}
