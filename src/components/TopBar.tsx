import React from 'react';
import type { StudioTab } from '../types/studio';

interface TopBarProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  onOpenExport: () => void;
}

const NAV_ITEMS: Array<{ id: StudioTab; label: string }> = [
  { id: 'script', label: 'Naskah' },
  { id: 'visual', label: 'Studio Visual' },
  { id: 'audio', label: 'Suara & Musik' },
  { id: 'assets', label: 'Aset Terpusat' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenExport,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0]">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-12 flex items-center justify-between gap-4">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('script');
          }}
          className="font-display text-base font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#2563EB] rounded-sm"
        >
          KineScript
        </a>

        <nav
          aria-label="Navigasi Studio"
          className="flex items-center gap-5 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative h-12 inline-flex items-center text-[13px] font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#2563EB] ${
                  isActive
                    ? 'text-[#0F172A] font-semibold'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#2563EB]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onOpenExport}
          className="h-8 px-3.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
        >
          Ekspor 4K
        </button>
      </div>
    </header>
  );
};

