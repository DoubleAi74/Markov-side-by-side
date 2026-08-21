import "./globals.css";
import Navbar from "@/components/Navbar";
import AppClientShell from "@/components/providers/AppClientShell";
import { auth } from "@/auth";
import { buildSessionUser } from "@/lib/auth/session-user";

export const metadata = {
  title: {
    default: "Markov Lab",
    template: "%s · Markov Lab",
  },
  description:
    "A reproducible browser workspace for jump processes, stochastic differential equations, and scientific analysis.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "icon",
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        rel: "icon",
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
};

export default async function RootLayout({ children }) {
  // Public browser tests intentionally run without production auth/database
  // services. The explicit flag is set only by the Playwright web server.
  const session = process.env.MARKOV_LAB_E2E === "true" ? null : await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <Navbar sessionUser={sessionUser} />
        <AppClientShell>
          <main id="main-content" tabIndex="-1">{children}</main>
        </AppClientShell>
      </body>
    </html>
  );
}
