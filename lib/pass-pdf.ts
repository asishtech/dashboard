import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";

export type Pass = {
  registration_id: string;
  qr_token: string;
  is_merch: boolean;
  event_name: string | null;
  event_day: string | null;
  event_venue: string | null;
};

/*
 * One page per pass.
 *
 * A page rather than a list, because a pass is shown to a volunteer at
 * a gate, on a phone, held at arm's length. One code filling the
 * screen scans; four in a column means pinching and panning at the
 * front of a queue.
 *
 * A5 portrait: on a phone the page fits the width with the QR still
 * large, and printed four to a sheet it is still legible.
 */
const WIDTH = 420;
const HEIGHT = 595;
const MARGIN = 36;

/* Brand ink, from the palette. Near-black rather than pure black. */
const INK = rgb(0.04, 0.04, 0.05);
const DIM = rgb(0.42, 0.42, 0.46);
const BRAND = rgb(0.847, 0.455, 0.153); /* #d87427 */

/*
 * pdf-lib's standard fonts encode WinAnsi, and drawing a character
 * outside it throws -- which would fail a whole batch over one curly
 * quote in an event title.
 *
 * So: fold the typographic characters a spreadsheet introduces to
 * their plain equivalents, keep the rest of Latin-1 (WinAnsi covers
 * A0-FF, which is where the accents in names live), and drop only
 * what is genuinely unencodable. Stripping all of it turned the
 * middot between a day and a venue into whitespace, and would have
 * made "Jose\u0301" out of a name it could not spell.
 */
function ascii(value: string) {
  return value
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F\u2009]/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "");
}

/* Cut to what fits, with an ellipsis, so a long event title cannot
   run off the page edge. */
function fit(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
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

/*
 * Break a string across lines that fit, rather than cutting it short.
 *
 * Only for the claim URL: a truncated event title is still a readable
 * title, but a truncated URL is a dead link -- and that line is the
 * entire fallback for a QR that will not scan.
 */
function wrap(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const text = ascii(value);

  const lines: string[] = [];

  let rest = text;

  while (rest.length > 0) {
    let take = rest.length;

    while (
      take > 1 &&
      font.widthOfTextAtSize(rest.slice(0, take), size) > maxWidth
    ) {
      take -= 1;
    }

    lines.push(rest.slice(0, take));
    rest = rest.slice(take);
  }

  return lines;
}

export async function buildPassPdf(input: {
  name: string | null;
  email: string;
  passes: Pass[];
  appUrl: string;
}): Promise<Buffer> {
  const QRCode = (await import("qrcode")).default;

  const pdf = await PDFDocument.create();

  pdf.setTitle("V-TAPP 2026 passes");
  pdf.setAuthor("V-TAPP, VIT-AP University");
  pdf.setSubject(
    `${input.passes.length} pass${input.passes.length === 1 ? "" : "es"} for ${input.email}`
  );

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);

  const inner = WIDTH - MARGIN * 2;

  for (const [index, pass] of input.passes.entries()) {
    const page = pdf.addPage([WIDTH, HEIGHT]);

    let y = HEIGHT - MARGIN;

    /* Brand rule, so a printed page is recognisable face down. */
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

    if (input.passes.length > 1) {
      const label = `Pass ${index + 1} of ${input.passes.length}`;

      page.drawText(label, {
        x: WIDTH - MARGIN - body.widthOfTextAtSize(label, 10),
        y,
        size: 10,
        font: body,
        color: DIM,
      });
    }

    y -= 30;

    const title = pass.is_merch
      ? "Merchandise collection"
      : (pass.event_name ?? "V-TAPP event");

    page.drawText(fit(title, bold, 17, inner), {
      x: MARGIN,
      y,
      size: 17,
      font: bold,
      color: INK,
    });

    y -= 20;

    const where = pass.is_merch
      ? "Collect at the V-TAPP counter"
      : [pass.event_day, pass.event_venue].filter(Boolean).join("  ·  ");

    if (where) {
      page.drawText(fit(where, body, 11, inner), {
        x: MARGIN,
        y,
        size: 11,
        font: body,
        color: DIM,
      });
    }

    /*
     * The QR, centred and large. Error correction H so a crease, a
     * thumb or a cracked screen still scans.
     */
    const dataUrl = await QRCode.toDataURL(
      `${input.appUrl}/claim/${pass.qr_token}`,
      { width: 600, margin: 1, errorCorrectionLevel: "H" }
    );

    const png = await pdf.embedPng(
      Buffer.from(dataUrl.split(",")[1], "base64")
    );

    const size = inner;

    y -= size + 24;

    page.drawImage(png, {
      x: MARGIN,
      y,
      width: size,
      height: size,
    });

    y -= 26;

    page.drawText(ascii(input.name || input.email), {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: INK,
    });

    y -= 15;

    page.drawText(`Registration #${ascii(pass.registration_id)}`, {
      x: MARGIN,
      y,
      size: 10,
      font: body,
      color: DIM,
    });

    y -= 15;

    page.drawText(
      pass.is_merch
        ? "Show this code at the counter to collect."
        : "Show this code at the venue to check in.",
      { x: MARGIN, y, size: 10, font: body, color: DIM }
    );

    /*
     * The link is the fallback when a screen will not scan, so it is
     * wrapped rather than truncated -- an ellipsis in the middle of a
     * 64-character token makes the one line that exists to rescue a
     * failed scan into a dead end.
     */
    const linkLines = wrap(
      `${input.appUrl}/claim/${pass.qr_token}`,
      body,
      7,
      inner
    );

    linkLines.forEach((line, row) => {
      page.drawText(line, {
        x: MARGIN,
        y: MARGIN + (linkLines.length - 1 - row) * 9,
        size: 7,
        font: body,
        color: DIM,
      });
    });
  }

  return Buffer.from(await pdf.save());
}
