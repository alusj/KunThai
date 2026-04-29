import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import "./styles/bankTheme.css";
import ToastProvider from "./components/Explore/shared/ToastProvider.jsx";

createRoot(document.getElementById('root')).render(
    <ToastProvider>
      <App />
    </ToastProvider>

)
 
