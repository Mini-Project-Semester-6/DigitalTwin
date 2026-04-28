import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Analysis from './pages/Analysis'
import Projections from './pages/Projections'
import History from './pages/History'
import OSICUpload from './pages/OSICUpload'
import OSICAnalysis from './pages/OSICAnalysis'
import OSICProjections from './pages/OSICProjections'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="upload" element={<Upload />} />
        <Route path="analysis/:scanId" element={<Analysis />} />
        <Route path="projections/:scanId" element={<Projections />} />
        <Route path="history" element={<History />} />
        <Route path="osic/upload"                  element={<OSICUpload />} />
        <Route path="osic/analysis/:scanId"        element={<OSICAnalysis />} />
        <Route path="osic/projections/:scanId"     element={<OSICProjections />} />
      </Route>
    </Routes>
  )
}
