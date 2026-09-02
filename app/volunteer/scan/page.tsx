import { redirect } from "next/navigation";

/*
 * The scanner moved to /volunteer, which is now the volunteer's only
 * screen. This stays so bookmarks and the QR flow's old return path
 * keep working.
 */
export default function ScanRedirect() {
  redirect("/volunteer");
}
