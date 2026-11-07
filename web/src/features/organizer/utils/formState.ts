// Submit state shared by the organizer forms.
export interface FormState {
  message: string;
  success: boolean;
  busy: boolean;
}

export const IDLE: FormState = { message: "", success: false, busy: false };

export function text(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim();
}
