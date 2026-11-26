import qrcode from 'qrcode-generator';

/** QR de [text] como imagen (data URL). */
export function qrDataUrl(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(4, 0);
}
