import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";

export type HostelPass = {
  registration_id: string;
  qr_token: string;
  name: string;
  day: string | null;
  accommodation: string | null;
};

/*
 * One page per guest, printable and handed out at the desk.
 *
 * Deliberately separate from lib/pass-pdf.ts rather than reusing it:
 * that builder puts one *person's* several passes on consecutive
 * pages under one shared name/email header. This is the opposite
 * shape -- one page each for many different people -- so forcing it
 * through the same function meant calling it once per guest and
 * stitching the results back together for one saving that gained
 * nothing over writing the handful of lines directly.
 */
const WIDTH = 420;
const HEIGHT = 595;
const MARGIN = 36;

const INK = rgb(0.04, 0.04, 0.05);
const DIM = rgb(0.42, 0.42, 0.46);
const BRAND = rgb(0.847, 0.455, 0.153);

/* Same WinAnsi fold as pass-pdf.ts -- pdf-lib's standard fonts throw
   on a character outside it, which would fail the whole batch over
   one curly quote in a name. */
function ascii(value: string) {
  return value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[    ]/g, " ")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "");
}

function fit(value: string, font: PDFFont, size: number, maxWidth: number) {
  const text = ascii(value);

  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let cut = text;

  while (
    cut.length > 1 &&
    font.widthOfTextAtSize(`${cut}...`, size) > maxWidth
  ) {
    cut = cut.slice(0, -1);
  }

  return `${cut}...`;
}

export async function buildHostelPassesPdf(
  guests: HostelPass[],
  appUrl: string
): Promise<Buffer> {
  const QRCode = (await import("qrcode")).default;

  const pdf = await PDFDocument.create();

  pdf.setTitle("V-TAPP 2026 hostel passes");
  pdf.setAuthor("V-TAPP, VIT-AP University");
  pdf.setSubject(`${guests.length} hostel passes`);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);

  const inner = WIDTH - MARGIN * 2;

  for (const guest of guests) {
    const page = pdf.addPage([WIDTH, HEIGHT]);

    let y = HEIGHT - MARGIN;

    page.drawRectangle({
      x: 0,
      y: HEIGHT - 6,
      width: WIDTH,
      height: 6,
      color: BRAND,
    });

    y -= 12;

    page.drawText("V-TAPP 2026", {
      x: MARGIN,
      y,
      size: 10,
      font: bold,
      color: BRAND,
    });

    y -= 30;

    page.drawText("Food & accommodation", {
      x: MARGIN,
      y,
      size: 17,
      font: bold,
      color: INK,
    });

    y -= 20;

    const where = [guest.day, guest.accommodation]
      .filter(Boolean)
      .join("  ·  ");

    if (where) {
      page.drawText(fit(where, body, 11, inner), {
        x: MARGIN,
        y,
        size: 11,
        font: body,
        color: DIM,
      });
    }

    const dataUrl = await QRCode.toDataURL(
      `${appUrl}/claim/${guest.qr_token}`,
      { width: 420, margin: 1, errorCorrectionLevel: "H" }
    );

    const png = await pdf.embedPng(
      Buffer.from(dataUrl.split(",")[1], "base64")
    );

    const size = inner;

    y -= size + 24;

    page.drawImage(png, { x: MARGIN, y, width: size, height: size });

    y -= 26;

    page.drawText(fit(guest.name || "Guest", bold, 12, inner), {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: INK,
    });

    y -= 15;

    page.drawText(`Registration #${ascii(guest.registration_id)}`, {
      x: MARGIN,
      y,
      size: 10,
      font: body,
      color: DIM,
    });

    y -= 15;

    page.drawText("Show this code at the hostel desk to check in.", {
      x: MARGIN,
      y,
      size: 10,
      font: body,
      color: DIM,
    });
  }

  return Buffer.from(await pdf.save());
}
