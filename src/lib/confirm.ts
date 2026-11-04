// Confirmation codes and QR codes shown to participants and scanned at packet pickup.
import QRCode from "qrcode";
import { appUrl } from "./mailer";

/** The QR code holds this link. Staff scanning it with a phone camera land on check-in for that person. */
export const confirmUrl = (code: string) => `${appUrl()}/c/${code}`;

export const qrSvg = (code: string) => QRCode.toString(confirmUrl(code), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
export const qrPng = (code: string) => QRCode.toBuffer(confirmUrl(code), { type: "png", margin: 1, width: 360, errorCorrectionLevel: "M" });

/** Accepts "rk-7f3k9q", "7F3K9Q", "RK 7F3K9Q" or a scanned link, and returns "RK-7F3K9Q" (or "" if it isn't a code). */
export function normalizeCode(input: string) {
  const s = input.trim().toUpperCase().replace(/^.*\/C\//, "");
  const m = s.match(/^(?:RK[-\s]?)?([2-9A-HJKMNP-Z]{6})$/);
  return m ? `RK-${m[1]}` : "";
}
