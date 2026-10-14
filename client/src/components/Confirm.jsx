import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from './GitDialogs.jsx';

// Confirmación con el diálogo de la app (en lugar de window.confirm del navegador).
// const confirm = useConfirm(); if (!(await confirm({ title, body, confirm: 'Cerrar', color: 'error' }))) return;
const Ctx = createContext(async () => true);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false); // separado del contenido para que no desaparezca durante el cierre
  const resolver = useRef(null);
  const ask = useCallback((opts) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setState(typeof opts === 'string' ? { title: opts } : opts);
    setOpen(true);
  }), []);
  const close = (answer) => { resolver.current?.(answer); resolver.current = null; setOpen(false); };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <ConfirmDialog open={open} title={state?.title} body={state?.body} confirm={state?.confirm || 'Confirmar'} color={state?.color}
        onClose={() => close(false)} onConfirm={() => close(true)} />
    </Ctx.Provider>
  );
}
