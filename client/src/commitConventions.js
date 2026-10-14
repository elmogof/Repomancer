// Convenciones de commit en el cliente: detectar el ticket en la rama, añadirlo al mensaje y rellenar la plantilla.
// Sin dependencias de React para poder probarlas aparte.

// «tipo(ámbito)!: » al principio de la primera línea (Conventional Commits).
export const PREFIX_RE = /^(\w+)(\(([^)]*)\))?(!)?:\s*/;

export const TICKET_MODES = [
  ['summary', 'Al inicio del resumen', 'fix(pagos): INC033 corrige el total'],
  ['end', 'Al final del resumen', 'fix(pagos): corrige el total (INC033)'],
  ['footer', 'En una línea al pie', 'fix(pagos): corrige el total\n\nRefs: INC033'],
  ['off', 'No añadir', ''],
];

// Ticket que aparece en el nombre de la rama (p. ej. INC033 en «INC033» o PAG-112 en «feature/PAG-112-checkout»).
export function detectTicket(branch, pattern) {
  if (!branch || !pattern) return null;
  try { return branch.match(new RegExp(pattern))?.[0] || null; } catch { return null; }
}

const has = (message, ticket) => message.toLowerCase().includes(ticket.toLowerCase());

// Añade el ticket al mensaje según el modo, si no está ya.
export function applyTicket(message, ticket, { mode, label = 'Refs' } = {}) {
  if (!ticket || !mode || mode === 'off' || !message.trim() || has(message, ticket)) return message;
  const [first, ...rest] = message.split('\n');
  if (mode === 'footer') return `${message.replace(/\s+$/, '')}\n\n${label}: ${ticket}`;
  if (mode === 'end') return [`${first.replace(/\s+$/, '')} (${ticket})`, ...rest].join('\n');
  const m = first.match(PREFIX_RE);
  const line = m ? `${m[0].replace(/\s*$/, ' ')}${ticket} ${first.slice(m[0].length)}` : `${ticket} ${first}`;
  return [line.replace(/\s+$/, ''), ...rest].join('\n');
}

// Plantilla con {ticket}, {branch} y {type}; las variables sin valor desaparecen.
export function renderTemplate(template, vars = {}) {
  return (template || '').replace(/\{(ticket|branch|type)\}/g, (_, k) => vars[k] || '');
}

// ¿El resumen sigue Conventional Commits? (tipo, ámbito opcional y texto).
export const isConventional = (message) => PREFIX_RE.test(message.split('\n')[0]) && message.split('\n')[0].replace(PREFIX_RE, '').trim().length > 0;
