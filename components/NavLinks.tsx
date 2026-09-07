"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number }) => React.ReactElement;
  exact?: boolean;
};

/* Below this the bar collapses to a stacked menu and everything fits
   by construction. Matches the breakpoint in globals.css. */
const STACKED = "(max-width: 900px)";

/*
 * Whether the bar is stacked, read as an external store rather than
 * mirrored into state by an effect. An effect that calls setState on
 * mount is a cascading render, and React says so; a media query is
 * exactly the "external system" this hook exists for.
 *
 * The server snapshot is false: the wide bar is what renders on the
 * server, and a narrow client corrects it on hydration.
 */
function subscribe(onChange: () => void) {
  const media = window.matchMedia(STACKED);

  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

/*
 * The links, with whatever does not fit moved into a menu.
 *
 * The bar used to scroll sideways with the scrollbar hidden, which
 * was tolerable at six items and is not at ten: links simply vanish
 * off the right-hand edge with nothing to say they exist.
 *
 * Measured rather than curated. Which links matter depends on the
 * role and on the hour of the fest, and a hand-picked "primary five"
 * would be wrong for somebody, and wrong again the next time a screen
 * is added. Widths are measured once and re-fitted on resize, so the
 * bar holds as many as the window allows and the rest are one click
 * away in order.
 */
export function NavLinks({
  items,
  isCurrent,
  onNavigate,
}: {
  items: NavItem[];
  isCurrent: (item: NavItem) => boolean;
  onNavigate: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const measured = useRef<number[]>([]);
  const moreWidth = useRef(0);

  /* Everything is shown until the first measurement, so the widths
     being measured are the real ones. */
  const [visible, setVisible] = useState(items.length);
  const [open, setOpen] = useState(false);

  const stacked = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(STACKED).matches,
    () => false
  );

  const fit = useCallback(() => {
    const container = row.current;

    if (!container || measured.current.length === 0) return;

    /*
     * A little narrower than the row really is.
     *
     * Widths are measured once, while every item is rendered, and
     * cannot be re-measured afterwards because the overflowing items
     * are no longer in the DOM to measure. So anything that shifts
     * them later -- a webfont replacing the fallback, a zoom step --
     * has to be absorbed rather than detected. Eight pixels covers
     * the drift a font swap causes across ten labels, at the cost of
     * occasionally holding one link back that would just have fitted.
     */
    const available = container.clientWidth - 8;

    let used = 0;
    let count = 0;

    for (const width of measured.current) {
      /* Room for the "More" button, unless this is the last item and
         it would then be the only thing left out. */
      const needsMore = count < measured.current.length - 1;

      if (used + width + (needsMore ? moreWidth.current : 0) > available) {
        break;
      }

      used += width;
      count += 1;
    }

    setVisible(Math.max(1, count));
  }, []);

  useLayoutEffect(() => {
    /*
     * Nothing to measure when stacked -- `shown` already ignores the
     * count in that mode, so setting it here would be a state write
     * that changes no output, which is precisely the cascading render
     * React objects to.
     */
    if (stacked) return;

    const container = row.current;

    if (!container) return;

    /*
     * Measure from the DOM while everything is rendered. Done in a
     * layout effect so the reflow happens before paint and nobody
     * sees the row overflow and then snap back.
     */
    const children = Array.from(
      container.querySelectorAll<HTMLElement>("[data-nav-item]")
    );

    if (children.length === items.length) {
      const gap = parseFloat(getComputedStyle(container).gap) || 0;

      measured.current = children.map(
        (child) => child.getBoundingClientRect().width + gap
      );

      const more = container.querySelector<HTMLElement>(
        "[data-nav-more]"
      );

      moreWidth.current = more
        ? more.getBoundingClientRect().width + gap
        : 96;
    }

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => observer.disconnect();
  }, [items, stacked, fit]);

  /* Close the menu on an outside click or Escape. */
  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("click", close);
    document.addEventListener("keydown", close);

    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const shown = stacked ? items : items.slice(0, visible);
  const hidden = stacked ? [] : items.slice(visible);

  /* If the page you are on is in the overflow, the menu says so --
     otherwise nothing on the bar is marked and it reads as though you
     are nowhere. */
  const currentHidden = hidden.some(isCurrent);

  return (
    <div className="nav-links" ref={row}>
      {shown.map((item) => {
        const Icon = item.icon;
        const current = isCurrent(item);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-nav-item
            className={`nav-link${current ? " nav-link-current" : ""}`}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon size={15} />
            {item.label}
          </Link>
        );
      })}

      {/*
        Rendered whenever anything is hidden, and also invisibly on
        the very first pass so its width can be measured before it is
        needed. Without that the first fit reserves a guess.
      */}
      {hidden.length > 0 && (
        <div className="nav-more">
          <button
            type="button"
            data-nav-more
            className={`nav-link${
              currentHidden ? " nav-link-current" : ""
            }`}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
          >
            More
            <span className="nav-more-count">{hidden.length}</span>
          </button>

          {open && (
            <div className="nav-more-menu" role="menu">
              {hidden.map((item) => {
                const Icon = item.icon;
                const current = isCurrent(item);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={`nav-more-item${
                      current ? " nav-link-current" : ""
                    }`}
                    aria-current={current ? "page" : undefined}
                    onClick={() => {
                      setOpen(false);
                      onNavigate();
                    }}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
