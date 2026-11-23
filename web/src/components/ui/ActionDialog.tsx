import { t, useLocale } from "../../i18n";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { TextAreaField } from "./Field";

interface DialogRequest {
  id: number;
  message: string;
  reason: boolean;
  /** Focused when the request was made: focus goes back here when the dialog closes. */
  opener: Element | null;
  /** Answered: the dialog is playing its exit and takes no more input. */
  closing: boolean;
  resolve: (value: string | null) => void;
}

let current: DialogRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => current;
function publish(request: DialogRequest | null) {
  current = request;
  listeners.forEach((listener) => listener());
}

/** Answers the open request at once; the dialog stays mounted while it leaves. */
function finish(value: string | null) {
  const request = current;
  if (!request || request.closing) return;
  publish({ ...request, closing: true });
  request.resolve(value);
}

/** The exit has played: the dialog leaves the document, unless a newer request replaced it. */
function closed(id: number) {
  if (current?.id === id) publish(null);
}

/** One destructive action at a time; a second request never replaces an open one, only one that is leaving. */
function ask(message: string, reason: boolean): Promise<string | null> {
  if (current && !current.closing) return Promise.resolve(null);
  // Read before the dialog mounts, so effects that run twice (StrictMode) cannot record a control inside it.
  const opener = document.activeElement;
  return new Promise((resolve) => publish({ id: nextId++, message, reason, opener, closing: false, resolve }));
}

export async function confirmAction(message: string): Promise<boolean> {
  return (await ask(message, false)) !== null;
}

export function requestReason(message: string): Promise<string | null> {
  return ask(message, true);
}

function returnFocus(opener: Element | null) {
  if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
}

/** The longest of the element's transition durations plus delays, in milliseconds (0 without transitions). */
function longestTransition(element: Element): number {
  const style = getComputedStyle(element);
  const times = (list: string) => list.split(",").map((part) => {
    const value = parseFloat(part);
    if (!Number.isFinite(value)) return 0;
    return part.trim().endsWith("ms") ? value : value * 1000;
  });
  const durations = times(style.transitionDuration || "0s");
  const delays = times(style.transitionDelay || "0s");
  return Math.max(0, ...durations.map((duration, index) => duration + (delays[index % delays.length] ?? 0)));
}

function Dialog({ request }: { request: DialogRequest }) {
  useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState("");

  // Open on mount; an open dialog that unmounts (the host going away) is closed first.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Answered: close now (the CSS plays the exit on the same path as the entry), give focus back, and
  // unmount once the exit transitions end. A timer at the longest transition covers engines that report
  // none, and reduced motion.
  useEffect(() => {
    const dialog = ref.current;
    if (!request.closing || !dialog) return;
    if (dialog.open) dialog.close();
    returnFocus(request.opener);
    let done = false;
    const unmount = () => {
      if (done) return;
      done = true;
      closed(request.id);
    };
    const timer = setTimeout(unmount, longestTransition(dialog) + 50);
    const running = typeof dialog.getAnimations === "function" ? dialog.getAnimations() : [];
    if (running.length) void Promise.all(running.map((animation) => animation.finished)).then(unmount, unmount);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [request.closing, request.id, request.opener]);

  return createPortal(
    <dialog ref={ref} className="action-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} inert={request.closing}
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
  useEffect(() => () => {
    const open = current && !current.closing ? current : null;
    finish(null);
    publish(null);
    if (open) returnFocus(open.opener);
  }, []);
  return request ? <Dialog key={request.id} request={request} /> : null;
}
