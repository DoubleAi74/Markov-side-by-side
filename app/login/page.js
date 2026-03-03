import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginForm from "@/components/auth/LoginForm";
import { normalizeAppPath } from "@/lib/auth/redirects";

export default async function LoginPage({ searchParams }) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = normalizeAppPath(params?.callbackUrl, "/dashboard");

  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center justify-center px-4 py-12">
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
