import QRCode from "qrcode";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

// Draws a QR code for `value` locally (no network): ticket QR payloads and
// entry confirmations. The quiet zone is part of the drawing.
export function qrPath(value: string): { size: number; path: string } {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const data = qr.modules.data;
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (data[row * count + col]) path += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
  }
  return { size: count + 8, path };
}

export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const { size: cells, path } = useMemo(() => qrPath(value), [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`}>
        <Rect width={cells} height={cells} fill="#ffffff" />
        <Path d={path} fill="#111111" />
      </Svg>
    </View>
  );
}
