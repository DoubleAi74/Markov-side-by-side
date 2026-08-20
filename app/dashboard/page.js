import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buildSessionUser } from "@/lib/auth/session-user";

export default async function DashboardRedirectPage() {
  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });

  if (!sessionUser?.id) {
    redirect("/login");
  }

  if (sessionUser.username) {
    redirect(`/-/${encodeURIComponent(sessionUser.username)}`);
  }

  redirect("/");
}
