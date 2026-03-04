import PasswordResetForm from "@/components/auth/PasswordResetForm";

export default async function ResetPasswordPage({ searchParams }) {
  const params = await searchParams;
  const initialEmail =
    typeof params?.email === "string" ? params.email : "";
  const initialToken =
    typeof params?.token === "string" ? params.token : "";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center justify-center px-4 py-12">
      <PasswordResetForm
        initialEmail={initialEmail}
        initialToken={initialToken}
      />
    </div>
  );
}
