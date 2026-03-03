import "./globals.css";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;
import Navbar from "@/components/Navbar";
import { auth } from "@/auth";

export const metadata = {
  title: "Markov Side-by-Side",
  description:
    "Interactive stochastic simulation tools: CTMC Gillespie, time-dependent CTMP, and SDE solver.",
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
  const session = await auth();
  const sessionUser = session?.user?.id
    ? {
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name ?? "",
      }
    : null;

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased">
        <Navbar sessionUser={sessionUser} />
        <main>{children}</main>
      </body>
    </html>
  );
}
