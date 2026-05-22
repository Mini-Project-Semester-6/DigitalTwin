import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Analyze from './pages/Analyze'
import About from './pages/About'
import Report from './pages/Report'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<Analyze />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/report"    element={<Report />} />
        <Route path="/about"     element={<About />} />
      </Routes>
    </Layout>
  )
}
