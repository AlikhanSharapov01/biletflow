import { Alert } from "react-native";
import { t } from "@/i18n";

// The phone's own confirm dialog, in place of the web's window.confirm.
// Resolves true only when the person taps the confirm button.
export function confirmAction({
  title,
  message,
  confirmLabel = t("common.confirm"),
  cancelLabel = t("common.cancel"),
  destructive = false,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
