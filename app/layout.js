import "./globals.css";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Markov Side-by-Side",
  description: "Interactive stochastic simulation tools: CTMC Gillespie, time-dependent CTMP, and SDE solver.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
