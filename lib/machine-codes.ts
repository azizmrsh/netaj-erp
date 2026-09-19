import bwipjs from "bwip-js/node";
import QRCode from "qrcode";

export async function qrDataUrl(value: string) {
  return QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: 180, color: { dark: "#000000", light: "#ffffff" } });
}

export async function barcodeDataUrl(value: string) {
  const buffer = await bwipjs.toBuffer({ bcid: "code128", text: value, scale: 2, height: 10, includetext: true, textxalign: "center" });
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
