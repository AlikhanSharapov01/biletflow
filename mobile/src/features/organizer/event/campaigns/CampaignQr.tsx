import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { fetchCampaignQr } from "@/api/campaigns";
import { describeError } from "@/api/errors";
import { safeFilename, saveFile } from "@/api/files";
import type { Campaign } from "@/api/types/campaigns";
import { ErrorPanel, LoadingState, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { colors, fonts } from "@/theme";

import { formStyles } from "../../components/formStyles";
import { t, useLocale } from "@/i18n";

// Server-rendered promo QR. It opens the campaign link; it is never an
// admission ticket and scanners reject it.
export function CampaignQr({ eventId, campaign }: { eventId: string; campaign: Campaign }) {
  useLocale();
  const { notify } = useToast();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchCampaignQr(eventId, campaign.id)
      .then((text) => active && setSvg(text))
      .catch((failure: unknown) => active && setError(describeError(failure)));
    return () => {
      active = false;
    };
  }, [eventId, campaign.id]);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(campaign.link_url);
      notify(t("org.link_copied"));
    } catch {
      notify(t("org.copy_failed"));
    }
  };

  const share = async () => {
    try {
      const filename = safeFilename(`promo-${campaign.code}.svg`);
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(svg);
      await saveFile({ uri: file.uri, filename, mimeType: "image/svg+xml" });
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <View style={formStyles.inline}>
      <StatusPill tone="pending" label={t("org.promo_qr_caption")} />
      {error ? <ErrorPanel title={t("org.qr_error")} message={error} /> : null}
      {!error && !svg ? <LoadingState message={t("org.loading_qr")} /> : null}
      {svg ? (
        <View
          style={styles.qr}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t("org.promo_qr_alt", { p0: campaign.name })}
        >
          <SvgXml xml={svg} width={180} height={180} />
        </View>
      ) : null}
      <Text style={styles.link} selectable>
        {campaign.link_url}
      </Text>
      <View style={formStyles.actions}>
        <SubtleButton label={t("org.copy_link")} onPress={() => void copy()} />
        <SubtleButton label={t("mobile.org.share_svg")} disabled={!svg} onPress={() => void share()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  qr: { alignSelf: "center", padding: 8, backgroundColor: "#fff" },
  link: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
});
