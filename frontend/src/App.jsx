import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Analyze from './pages/Analyze'
import About from './pages/About'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"        element={<Dashboard />} />
        <Route path="/analyze" element={<Analyze />} />
        <Route path="/about"   element={<About />} />
      </Routes>
    </Layout>
  )
}
