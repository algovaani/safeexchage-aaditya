import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { RealtimeProvider } from './context/RealtimeContext.jsx';
import { PlatformConfigProvider } from './context/PlatformConfigContext.jsx';
import { TradingPairsProvider } from './context/TradingPairsContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { DialogProvider } from './context/DialogContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
      <ThemeProvider>
        <PlatformConfigProvider>
          <TradingPairsProvider>
          <AuthProvider>
            <RealtimeProvider>
              <ToastProvider>
                <DialogProvider>
                  <App />
                </DialogProvider>
              </ToastProvider>
            </RealtimeProvider>
          </AuthProvider>
          </TradingPairsProvider>
        </PlatformConfigProvider>
      </ThemeProvider>
    </BrowserRouter>
);
