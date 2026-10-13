import { createContext, useCallback, useContext, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const Ctx = createContext(() => {});
export const useNotify = () => useContext(Ctx);

export function NotifyProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const notify = useCallback((text, severity = 'success') => setMsg({ text: String(text), severity, key: Date.now() }), []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      <Snackbar key={msg?.key} open={!!msg} autoHideDuration={msg?.severity === 'error' ? 10000 : 4000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {msg ? <Alert severity={msg.severity} variant="filled" onClose={() => setMsg(null)} sx={{ whiteSpace: 'pre-wrap', maxWidth: 600 }}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}
