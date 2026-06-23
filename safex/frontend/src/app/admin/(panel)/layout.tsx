import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import {
  LayoutDashboard, Users, Shield, Wallet, ArrowLeftRight, ListOrdered, Sprout, Settings,
} from 'lucide-react';

const NAV = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/kyc', icon: Shield, label: 'KYC' },
  { href: '/admin/deposits', icon: Wallet, label: 'Deposits' },
  { href: '/admin/trades', icon: ArrowLeftRight, label: 'Trades' },
  { href: '/admin/orders', icon: ListOrdered, label: 'Orders' },
  { href: '/admin/staking', icon: Sprout, label: 'Staking' },
  { href: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-primary">
      <aside className="w-[240px] shrink-0 bg-secondary border-r border-border">
        <div className="h-[60px] flex items-center gap-2 px-5 border-b border-border">
          <BrandLogo size="sm" />
          <span className="text-xs text-text-secondary font-medium">Admin</span>
        </div>
        <nav className="p-3 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-sm text-text-secondary hover:bg-tertiary no-underline"
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[60px] bg-secondary border-b border-border px-6 flex items-center">
          <span className="text-sm text-text-secondary">Admin Panel</span>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
