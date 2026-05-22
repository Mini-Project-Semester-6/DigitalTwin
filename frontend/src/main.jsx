import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ResultsStoreProvider } from './hooks/useResultsStore'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ResultsStoreProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0f1f35',
              color: '#e2eaf4',
              border: '1px solid #1a3050',
              fontFamily: '"DM Sans", system-ui',
            },
          }}
        />
      </ResultsStoreProvider>
    </BrowserRouter>
  </React.StrictMode>
)
