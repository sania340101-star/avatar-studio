'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Pose Matrix', href: '/pose-matrix' },
  { label: 'Slots', href: '/templates' },
];

export default function TemplateTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 text-center text-sm py-1.5 rounded-md font-medium transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text3)',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
