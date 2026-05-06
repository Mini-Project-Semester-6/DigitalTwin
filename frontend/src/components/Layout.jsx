import { NavLink } from 'react-router-dom'
import { Activity, Scan, Info, Cpu } from 'lucide-react'

const NAV = [
  { to: '/',        label: 'Dashboard', Icon: Activity },
  { to: '/analyze', label: 'Analyze',   Icon: Scan },
  { to: '/about',   label: 'About',     Icon: Info },
]

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* ── Header ────────────────────────────────────── */}
      <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--rim)' }}
              className="flex items-center justify-between px-8 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="pulse-dot absolute inline-flex h-full w-full rounded-full"
                  style={{ background: 'var(--teal)', opacity: .75 }} />
            <span className="relative inline-flex rounded-full h-3 w-3"
                  style={{ background: 'var(--teal)' }} />
          </span>
          <span className="font-display font-700 text-xl tracking-tight glow-cyan"
                style={{ color: 'var(--cyan)' }}>
            LungTwin
          </span>
          <span className="text-xs font-mono opacity-40 ml-1">COVID-19 Digital Twin</span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ` +
                (isActive
                  ? 'text-[var(--cyan)] bg-[rgba(0,212,232,0.12)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[rgba(255,255,255,0.05)]')
              }>
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 text-xs font-mono opacity-40">
          <Cpu size={12} />
          <span>v1.0.0</span>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
