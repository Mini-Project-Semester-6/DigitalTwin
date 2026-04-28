import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Activity, Upload, Clock, BarChart2, Cpu } from 'lucide-react'

const navItems = [
  { to: '/',                icon: Activity,  label: 'Dashboard' },
  { to: '/upload',          icon: Upload,    label: 'LUNA Scan'  },
  { to: '/osic/upload',     icon: Upload,    label: 'OSIC Scan'  },
  { to: '/history',         icon: Clock,     label: 'History'   },
]

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col grid-bg">
      {/* Top bar */}
      <header className="panel border-b border-border flex items-center justify-between px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 border border-accent flex items-center justify-center">
              <Cpu size={16} className="text-accent" />
            </div>
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-safe rounded-full animate-pulse" />
          </div>
          <div>
            <div className="font-display font-bold text-lg text-black tracking-tight leading-none">
              Pneuma<span className="text-accent">Twin</span>
            </div>
            <div className="label-tag" style={{ fontSize: '0.58rem' }}>
              Lung Digital Twin Platform v1.0
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest transition-all duration-200 ${
                  isActive
                    ? 'text-accent border-b border-accent'
                    : 'text-dim hover:text-black'
                }`
              }
            >
              <Icon size={13} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <StatusPill />
          <div className="text-right">
            <div className="label-tag">System</div>
            <div className="mono text-xs text-safe">ONLINE</div>
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div className="border-b border-border bg-panel overflow-hidden" style={{ height: '26px' }}>
        <div className="ticker-inner flex items-center h-full whitespace-nowrap" style={{ width: '200%' }}>
          {[...Array(2)].map((_, rep) => (
            <span key={rep} className="flex items-center gap-8 px-4">
              {[
                'MODEL: TINY3DCNN + GCN  ✦',
                'PRECISION: FP16  ✦',
                'PATCH SIZE: 32³  ✦',
                'VOXEL SPACING: 2.0mm  ✦',
                'DATASET: LUNA16 PRE-SEGMENTED  ✦',
                'FEATURES: 16 GEOMETRIC + 64 CNN  ✦',
                'MARCHING CUBES: ENABLED  ✦',
                'GNN k-NN: k=5  ✦',
              ].map(t => (
                <span key={t} className="label-tag" style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                  {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="panel border-t border-border px-6 py-3 flex items-center justify-between">
        <span className="label-tag"> Research Use Only. Not for Clinical Diagnosis.</span>
        <span className="mono text-xs text-dim">BUILD 20250419.001</span>
      </footer>
    </div>
  )
}

function StatusPill() {
  return (
    <div className="flex items-center gap-2 panel px-3 py-1.5 border-border">
      <div className="relative flex items-center justify-center w-3 h-3">
        <div className="absolute w-3 h-3 bg-safe rounded-full opacity-30 animate-ping" />
        <div className="w-1.5 h-1.5 bg-safe rounded-full" />
      </div>
      <span className="mono text-xs text-safe">MODEL READY</span>
    </div>
  )
}
