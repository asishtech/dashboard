import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* A phone photo, not a scan. Anything larger is a mistake. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const BUCKET = "id-cards";

/*
 * Private, always.
 *
 * These are photographs of student ID cards -- a name, a face and a
 * roll number belonging to somebody who is not a student here. A
 * public bucket would put them on a guessable URL, so the bucket is
 * created private and read back through a signed link that expires.
 */
async function ensureBucket() {
  const db = supabaseAdmin();

  const { data } = await db.storage.getBucket(BUCKET);

  if (data) return;

  await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ALLOWED,
  });
}

/*
 * POST /api/desk/id-card   (multipart: registrationId, file)
 *
 * Record that a visitor's college ID was seen at the desk.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const form = await request.formData();

    const id = Number(form.get("registrationId"));

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "A registration is required" },
        { status: 400 }
      );
    }

    /*
     * The same route takes both desk photographs: the ID card, and
     * the live photo of the person holding it. They share a bucket, a
     * row and a size limit; only the column and the path differ.
     */
    const kind = form.get("kind") === "photo" ? "photo" : "id";

    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No photo was attached" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `That photo is ${Math.round(
            file.size / 1024 / 1024
          )} MB. The limit is 8 MB.`,
        },
        { status: 413 }
      );
    }

    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: "Attach a JPEG, PNG or WebP image" },
        { status: 415 }
      );
    }

    await ensureBucket();

    const db = supabaseAdmin();

    const extension = file.type.split("/")[1].replace("jpeg", "jpg");

    /*
     * Keyed by registration, so a re-take replaces rather than
     * accumulates: the desk photographing a card twice should leave
     * one card, not two.
     */
    const path =
      kind === "photo"
        ? `${id}-photo.${extension}`
        : `${id}.${extension}`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const now = new Date().toISOString();

    /*
     * storage_path is NOT NULL, so a photo arriving before the card
     * cannot leave it empty. The photo's own path stands in until a
     * card is taken, and the card overwrites it -- which is the right
     * way round, because the row exists to say "this visitor was
     * checked" and either check starts that.
     */
    const patch: Record<string, unknown> =
      kind === "photo"
        ? {
            registration_id: id,
            storage_path: path,
            photo_path: path,
            photo_at: now,
            photo_by: auth.user.email ?? null,
            liveness:
              typeof form.get("liveness") === "string"
                ? String(form.get("liveness"))
                : "none",
            liveness_score: Number(form.get("livenessScore")) || null,
          }
        : {
            registration_id: id,
            storage_path: path,
            uploaded_by: auth.user.email ?? null,
            uploaded_at: now,
          };

    const { error } = await db
      .from("external_id_cards")
      .upsert(patch, { onConflict: "registration_id" });

    if (error?.code === "42P01") {
      return NextResponse.json(
        { error: "Run supabase/desk-tools.sql first." },
        { status: 409 }
      );
    }

    /* 42703: the photo columns arrive with desk-photo.sql. */
    if (error?.code === "42703") {
      return NextResponse.json(
        { error: "Run supabase/desk-photo.sql to store live photos." },
        { status: 409 }
      );
    }

    if (error) throw error;

    return NextResponse.json({ success: true, path, kind });
  } catch (error) {
    console.error("ID card upload failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}

/*
 * GET /api/desk/id-card?registrationId=...
 *
 * A short-lived link to the stored photo. Signed rather than public:
 * the bucket is private and stays that way.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const id = Number(
      new URL(request.url).searchParams.get("registrationId")
    );

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "A registration is required" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: row } = await db
      .from("external_id_cards")
      .select("storage_path,uploaded_by,uploaded_at")
      .eq("registration_id", id)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ success: true, url: null });
    }

    const { data } = await db.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 300);

    return NextResponse.json({
      success: true,
      url: data?.signedUrl ?? null,
      uploadedBy: row.uploaded_by,
      uploadedAt: row.uploaded_at,
    });
  } catch (error) {
    console.error("ID card read failed:", error);

    return NextResponse.json(
      { error: "Unable to read that ID card" },
      { status: 500 }
    );
  }
}
