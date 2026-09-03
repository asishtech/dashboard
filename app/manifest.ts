import type { MetadataRoute } from "next";

/*
 * Installable, and opened in standalone mode. A volunteer working a
 * gate for two days should not be hunting for a browser tab, and an
 * installed app keeps its service worker and its offline pass list
 * between sessions.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "V-TAPP Dashboard",
    short_name: "V-TAPP",
    description:
      "Registration, check-in and merchandise distribution for V-TAPP.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0910",
    theme_color: "#0a0910",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
