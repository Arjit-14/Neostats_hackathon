/**
 * Root route — redirects to the dashboard.
 * The dashboard layout will redirect unauthenticated users to /login.
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
