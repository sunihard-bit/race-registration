"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Tabs({ base, tabs }: { base: string; tabs: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="tabs">
      {tabs.map(([seg, label]) => {
        const href = seg ? `${base}/${seg}` : base;
        const on = seg ? path.startsWith(href) : path === base;
        return <Link key={seg} href={href} className={on ? "on" : ""}>{label}</Link>;
      })}
    </nav>
  );
}
