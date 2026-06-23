import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import {
  LayoutDashboard,
  LineChart,
  ArrowLeftRight,
  Wallet,
  History,
  Shield,
  Settings,
  Sprout,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/markets', icon: LineChart, label: 'Markets' },
  { href: '/dashboard/trade', icon: ArrowLeftRight, label: 'Trade' },
  { href: '/dashboard/staking', icon: Sprout, label: 'Staking' },
  { href: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
  { href: '/dashboard/history', icon: History, label: 'History' },
  { href: '/dashboard/kyc', icon: Shield, label: 'KYC' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-primary">
      <aside className="w-[240px] shrink-0 bg-secondary border-r border-border flex flex-col">
        <div className="h-[60px] flex items-center px-5 border-b border-border">
          <BrandLogo size="sm" />
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-sm text-text-secondary hover:bg-tertiary hover:text-text-primary no-underline border-l-[3px] border-transparent hover:border-accent"
              >
                <Icon size={18} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[60px] bg-secondary border-b border-border flex items-center px-6">
          <input
            className="ui-input max-w-md !h-9"
            placeholder="Search markets, assets…"
          />
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
