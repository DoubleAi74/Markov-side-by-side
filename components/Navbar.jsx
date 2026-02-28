"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/gillespie", label: "CTMC Gillespie" },
  { href: "/ctmp-inhomo", label: "CTMP (Time-Dep.)" },
  { href: "/sde", label: "SDE Solver" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 h-14 bg-slate-900 text-white shadow-md relative">
      <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">
        <Link
          href="/"
          className="text-base md:text-lg font-bold tracking-tight text-white hover:text-indigo-300 transition"
          onClick={() => setMenuOpen(false)}
        >
          Markov Side-by-Side
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-menu"
        >
          {menuOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <div
          id="mobile-nav-menu"
          className="md:hidden absolute top-14 left-0 right-0 bg-slate-800 shadow-lg border-t border-slate-700 z-50"
        >
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`block px-4 py-3 text-sm font-medium border-b border-slate-700 last:border-b-0 transition ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
