// Submit state shared by the organizer forms.
export interface FormState {
  message: string;
  success: boolean;
  busy: boolean;
}

export const IDLE: FormState = { message: "", success: false, busy: false };
