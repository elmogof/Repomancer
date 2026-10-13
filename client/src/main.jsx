import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App.jsx';
import { NotifyProvider } from './components/Notify.jsx';
import buildTheme from './theme.js';

function Root() {
  const [mode, setMode] = useState(() => localStorage.getItem('gm-theme') || 'dark');
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const toggle = () => setMode((m) => { const n = m === 'dark' ? 'light' : 'dark'; localStorage.setItem('gm-theme', n); return n; });
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotifyProvider>
        <BrowserRouter>
          <App mode={mode} onToggleMode={toggle} />
        </BrowserRouter>
      </NotifyProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
