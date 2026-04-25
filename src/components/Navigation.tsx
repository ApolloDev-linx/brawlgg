"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/maps", label: "Map meta" },
  { href: "/counter", label: "Counters" },
  { href: "/draft", label: "Draft sim" },
  { href: "/player", label: "Player lookup" },
  { href: "/analyzer", label: "Analyzer" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border mb-6">
      <div className="max-w-5xl mx-auto px-4">
                <div className="flex items-center gap-3 py-4">
          <Image
            src="/brawlgglogo.png"
            alt="Apollo Meta"
            width={160}
            height={140}
            priority
          />
          <div>
            <div className="text-sm font-medium tracking-tight">
              Apollo Meta
            </div>
            <div className="text-[10px] text-text-tertiary tracking-widest uppercase mt-0.5">
              Brawl Stars Intelligence
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-1 -mb-px overflow-x-auto pb-0">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-sm whitespace-nowrap transition-colors border-b-2"
                style={{
                  color: isActive
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  borderBottomColor: isActive
                    ? "var(--text-primary)"
                    : "transparent",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
