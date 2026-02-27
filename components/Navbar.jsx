'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/gillespie', label: 'CTMC Gillespie' },
  { href: '/ctmp-inhomo', label: 'CTMP (Time-Dep.)' },
  { href: '/sde', label: 'SDE Solver' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 h-14 bg-slate-900 text-white shadow-md">
      <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight text-white hover:text-indigo-300 transition">
          Markov Side-by-Side
        </Link>
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
