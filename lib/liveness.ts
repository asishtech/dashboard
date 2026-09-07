/*
 * Is the thing in front of the camera a person, or a photograph of
 * one.
 *
 * Two checks, because the good one is expensive:
 *
 *   blink   a face landmarker watches the eyelids and waits for them
 *           to close and reopen. Costs about 15 MB on first use --
 *           11 MB of wasm plus a 3.8 MB model -- fetched from a CDN.
 *
 *   motion  three frames a few hundred milliseconds apart are
 *           compared. A printed photo or a phone screen held up gives
 *           near-identical frames; a living person never does. No
 *           download, works instantly, and catches the obvious trick
 *           rather than a determined one.
 *
 * The desk gets whichever is ready. On fest wifi with a queue
 * building, a check that needs 15 MB before the first photo can be
 * taken is worse than a weaker check that runs now -- so blink is
 * attempted, and motion takes over if it is not ready in time.
 */

export type Liveness = "blink" | "motion" | "none";

/* Past this, the eyelid is closed. MediaPipe's blendshape score runs
   0 to 1; a relaxed open eye sits near 0.1 and a blink peaks above
   0.5. Chosen high enough that a squint or a glance down does not
   count. */
const BLINK_CLOSED = 0.5;

/* And back below this to count as reopened. Requiring a full return
   to baseline would fail anyone with narrow eyes or glasses. */
const BLINK_OPEN = 0.25;

/*
 * Mean per-pixel difference between two frames, on a heavily
 * downscaled greyscale copy.
 *
 * Downscaled because the question is "did anything move", not "what
 * moved": at 32x24 a blink or a head turn still registers, while
 * sensor noise and JPEG shimmer average out. Comparing full frames
 * would report motion for a still photograph under a flickering
 * light.
 */
export function frameDifference(
  a: ImageData,
  b: ImageData
): number {
  let total = 0;

  const n = Math.min(a.data.length, b.data.length);

  for (let i = 0; i < n; i += 4) {
    const greyA =
      a.data[i] * 0.299 + a.data[i + 1] * 0.587 + a.data[i + 2] * 0.114;

    const greyB =
      b.data[i] * 0.299 + b.data[i + 1] * 0.587 + b.data[i + 2] * 0.114;

    total += Math.abs(greyA - greyB);
  }

  return total / (n / 4);
}

/*
 * How different two frames must be, on average, to count as movement.
 *
 * A tripod-still camera pointed at a printed photo measures under 1.
 * A person simply standing there measures 3 or more, because faces
 * are never still. Four leaves room for a very steady subject without
 * admitting a photograph.
 */
export const MOTION_THRESHOLD = 4;

/*
 * Tracks eyelid scores over time and reports a completed blink.
 *
 * A blink is a closure *followed by* an opening. Reporting on closure
 * alone would pass a photograph of somebody with their eyes shut,
 * which is not a hard photograph to obtain.
 */
export class BlinkWatcher {
  private closed = false;
  private peak = 0;

  /* Returns true on the frame the blink completes. */
  push(score: number): boolean {
    if (!this.closed && score >= BLINK_CLOSED) {
      this.closed = true;
      this.peak = score;
      return false;
    }

    if (this.closed) {
      this.peak = Math.max(this.peak, score);

      if (score <= BLINK_OPEN) {
        this.closed = false;
        return true;
      }
    }

    return false;
  }

  get score() {
    return this.peak;
  }

  reset() {
    this.closed = false;
    this.peak = 0;
  }
}
