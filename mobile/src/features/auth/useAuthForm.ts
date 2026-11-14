import { useState } from "react";

import { resendVerification } from "@/api/account";
import { forgotPassword, register } from "@/api/auth";
import { useAuth } from "@/features/auth/AuthContext";
import { t } from "@/i18n";

export type AuthMode = "login" | "register";

export type AuthMessage = { text: string; success: boolean };

// State and actions behind the sign-in / create-account panel. Both modes
// share one set of fields, so switching tabs keeps what was typed.
export function useAuthForm() {
  const { login } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(null);

  const registering = mode === "register";
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!registering || name.trim().length > 0) &&
    !submitting;

  function switchMode(next: AuthMode) {
    setMode(next);
    setMessage(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);
    try {
      if (registering) {
        await register(email.trim(), password, name.trim());
        setMessage({
          text: t("auth.registration_received"),
          success: true,
        });
      } else {
        await login(email.trim(), password);
        // No navigation call needed: signing in flips AuthContext to
        // "signedIn", and (auth)/_layout's redirect takes it from there.
        return;
      }
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : t("mobile.api.went_wrong"),
        success: false,
      });
    }
    setSubmitting(false);
  }

  async function handleForgot() {
    if (!email.trim()) {
      setMessage({ text: t("auth.email_first"), success: false });
      return;
    }
    try {
      await forgotPassword(email.trim());
      setMessage({
        text: t("auth.reset_sent"),
        success: true,
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : t("mobile.api.went_wrong"),
        success: false,
      });
    }
  }

  async function handleResend() {
    if (!email.trim()) {
      setMessage({ text: t("auth.email_first"), success: false });
      return;
    }
    try {
      await resendVerification(email.trim());
      setMessage({ text: t("auth.verification_sent"), success: true });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : t("mobile.api.went_wrong"),
        success: false,
      });
    }
  }

  return {
    mode,
    registering,
    switchMode,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword: () => setShowPassword((shown) => !shown),
    submitting,
    canSubmit,
    message,
    handleSubmit,
    handleForgot,
    handleResend,
  };
}

export type AuthFormState = ReturnType<typeof useAuthForm>;
