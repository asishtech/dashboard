"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlinkWatcher,
  MOTION_THRESHOLD,
  frameDifference,
  type Liveness,
} from "@/lib/liveness";

/* How long to wait for the landmarker before falling back. A desk
   with a queue cannot stand still for a 15 MB download. */
const MODEL_TIMEOUT_MS = 9000;

const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Mode = "starting" | "blink" | "motion" | "captured";

/*
 * A live photo of the person at the desk.
 *
 * The point is not the photograph, it is the evidence that somebody
 * was standing there: a still held up to the lens should not pass. So
 * the shutter is not a button. It fires when the check does.
 */
export function LivePhotoCapture({
  registrationId,
  onDone,
  onCancel,
}: {
  registrationId: number;
  onDone: (result: {
    liveness: Liveness;
    score: number;
  }) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>("starting");
  const [status, setStatus] = useState("Starting the camera…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<string | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  /* Grab the current frame as a data URL and as pixels. */
  const grab = useCallback((small = false) => {
    const v = video.current;
    const c = canvas.current;

    if (!v || !c || !v.videoWidth) return null;

    const w = small ? 32 : v.videoWidth;
    const h = small ? 24 : v.videoHeight;

    c.width = w;
    c.height = h;

    const ctx = c.getContext("2d", { willReadFrequently: true });

    if (!ctx) return null;

    ctx.drawImage(v, 0, 0, w, h);

    return {
      pixels: ctx.getImageData(0, 0, w, h),
      dataUrl: small ? null : c.toDataURL("image/jpeg", 0.85),
    };
  }, []);

  const upload = useCallback(
    async (dataUrl: string, liveness: Liveness, score: number) => {
      setBusy(true);

      try {
        const blob = await (await fetch(dataUrl)).blob();

        const body = new FormData();
        body.set("registrationId", String(registrationId));
        body.set("kind", "photo");
        body.set("liveness", liveness);
        body.set("livenessScore", String(score));
        body.set(
          "file",
          new File([blob], "photo.jpg", { type: "image/jpeg" })
        );

        const response = await fetch("/api/desk/id-card", {
          method: "POST",
          body,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Upload failed");
        }

        onDone({ liveness, score });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Upload failed"
        );
      } finally {
        setBusy(false);
      }
    },
    [registrationId, onDone]
  );

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    const watcher = new BlinkWatcher();

    async function start() {
      try {
        /*
         * Rear camera. This is the desk's device held up to the
         * visitor, not their own phone held up to themselves -- the
         * front camera would frame whoever is holding it, not the
         * person the liveness check is actually about.
         */
        stream.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 },
          audio: false,
        });

        if (cancelled) {
          stop();
          return;
        }

        if (video.current) {
          video.current.srcObject = stream.current;
          await video.current.play();
        }
      } catch {
        setError(
          "The camera did not open. Allow camera access, or use HTTPS."
        );
        return;
      }

      /*
       * Try the landmarker, but do not wait on it. Whichever resolves
       * first decides the mode: the model if it arrives in time, the
       * motion check if it does not.
       */
      const landmarker = (async () => {
        const vision = await import("@mediapipe/tasks-vision");

        const files = await vision.FilesetResolver.forVisionTasks(
          WASM
        );

        return vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
      })();

      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), MODEL_TIMEOUT_MS)
      );

      setStatus("Looking for a face…");

      const model = await Promise.race([
        landmarker.catch(() => null),
        timeout,
      ]);

      if (cancelled) return;

      if (model) {
        setMode("blink");
        setStatus("Look at the camera and blink");

        const tick = () => {
          if (cancelled || !video.current?.videoWidth) {
            raf = requestAnimationFrame(tick);
            return;
          }

          const result = model.detectForVideo(
            video.current,
            performance.now()
          );

          const shapes =
            result.faceBlendshapes?.[0]?.categories ?? [];

          const left = shapes.find(
            (c) => c.categoryName === "eyeBlinkLeft"
          );

          const right = shapes.find(
            (c) => c.categoryName === "eyeBlinkRight"
          );

          if (!left || !right) {
            setStatus("No face in view — move into the frame");
            raf = requestAnimationFrame(tick);
            return;
          }

          /* Both eyes, averaged. One eye alone is a wink, and a
             printed photo tilted at the lens can fool a single-eye
             score more easily than two. */
          const score = (left.score + right.score) / 2;

          if (watcher.push(score)) {
            const frame = grab();

            if (frame?.dataUrl) {
              setShot(frame.dataUrl);
              setMode("captured");
              stop();
              void upload(frame.dataUrl, "blink", watcher.score);
              return;
            }
          }

          setStatus(
            score > 0.3
              ? "Hold it — blink once more"
              : "Look at the camera and blink"
          );

          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return;
      }

      /*
       * Fallback. Three frames over roughly a second and a half: if
       * they barely differ, the camera is pointed at something that
       * is not alive.
       */
      setMode("motion");
      setStatus("Hold still, then blink — capturing in a moment");

      const frames: ImageData[] = [];

      for (let i = 0; i < 3; i += 1) {
        await new Promise((r) => setTimeout(r, 600));

        if (cancelled) return;

        const f = grab(true);
        if (f) frames.push(f.pixels);
      }

      if (frames.length < 3) {
        setError("Could not read the camera.");
        return;
      }

      const moved = Math.max(
        frameDifference(frames[0], frames[1]),
        frameDifference(frames[1], frames[2])
      );

      if (moved < MOTION_THRESHOLD) {
        setError(
          `That looks like a still image, not a person (movement ${moved.toFixed(
            1
          )}, needs ${MOTION_THRESHOLD}). Try again.`
        );
        return;
      }

      const frame = grab();

      if (frame?.dataUrl) {
        setShot(frame.dataUrl);
        setMode("captured");
        stop();
        void upload(frame.dataUrl, "motion", moved);
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [grab, stop, upload]);

  return (
    <div className="live-capture">
      <div className="live-frame">
        {shot ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={shot} alt="The photo just taken" />
        ) : (
          <video ref={video} playsInline muted />
        )}
      </div>

      <canvas ref={canvas} className="sr-only" />

      <p className={error ? "banner banner-danger" : "help"}>
        {error ||
          (busy
            ? "Saving…"
            : mode === "captured"
              ? "Captured."
              : status)}
      </p>

      {mode === "motion" && !error && (
        <p className="help dim">
          Blink detection is unavailable, so this is checking for
          movement instead — a weaker test, and it is recorded as
          such.
        </p>
      )}

      <div className="resend-search">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            stop();
            onCancel();
          }}
          disabled={busy}
        >
          {mode === "captured" ? "Close" : "Cancel"}
        </button>

        {error && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
