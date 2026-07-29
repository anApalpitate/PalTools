import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initializeTheme } from './theme/theme'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('找不到应用挂载节点 #root')
}

initializeTheme()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
