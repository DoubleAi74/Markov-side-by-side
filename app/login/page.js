import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buildSessionUser } from "@/lib/auth/session-user";
import LoginForm from "@/components/auth/LoginForm";
import { normalizeAppPath } from "@/lib/auth/redirects";

export default async function LoginPage({ searchParams }) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = normalizeAppPath(params?.callbackUrl, "/");

  if (session?.user?.id) {
    const sessionUser = await buildSessionUser(session, { ensureUsername: true });
    if (sessionUser?.username) {
      redirect(`/-/${encodeURIComponent(sessionUser.username)}`);
    }
    redirect(callbackUrl);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center justify-center px-4 py-12">
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
