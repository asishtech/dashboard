/*
 * Icon set.
 *
 * One family, one stroke width, one size token. Emoji were used as
 * structural icons before; they render differently on every platform
 * and cannot be themed.
 *
 * Icons are decorative by default (aria-hidden). Pass a `title` when
 * the icon is the only thing conveying meaning.
 */

type IconProps = {
  size?: number;
  title?: string;
  className?: string;
};

function base({ size = 16, title, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": title ? undefined : true,
    role: title ? "img" : undefined,
  };
}

export function TicketIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6Z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="m21 8-9-5-9 5v8l9 5 9-5Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 20v-1a4 4 0 0 0-3-3.85M16 3.6a4 4 0 0 1 0 6.8" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title && <title>{props.title}</title>}
      <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" />
      <path d="M3 12h5l1.5 2.5h5L16 12h5L18.5 5A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1Z" />
    </svg>
  );
}

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
