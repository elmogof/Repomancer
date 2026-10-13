// Calcula los carriles del gráfico de ramas a partir de commits en orden topológico (hijos antes que padres).
// Por fila devuelve: col (carril del commit), lanes antes y después del commit, y las uniones con sus padres.
// Los carriles libres se reutilizan sin compactar, así cada línea conserva su posición vertical.
export function computeGraph(commits) {
  let lanes = [];
  let width = 1;
  const rows = commits.map((c) => {
    const before = lanes.slice();
    let col = before.indexOf(c.hash);
    if (col === -1) {
      col = lanes.indexOf(null);
      if (col === -1) col = lanes.length;
    }
    const next = lanes.slice();
    // Otros carriles que esperaban este commit (varios hijos) terminan aquí.
    const joins = [];
    next.forEach((h, i) => { if (h === c.hash && i !== col) { joins.push(i); next[i] = null; } });
    next[col] = c.parents[0] || null;
    // Padres adicionales (merge): reutilizan su carril si ya existe o abren uno nuevo.
    const forks = [];
    for (const p of c.parents.slice(1)) {
      let i = next.indexOf(p);
      if (i === -1) {
        i = next.indexOf(null);
        if (i === -1 || i === col) i = next.length;
        next[i] = p;
      }
      forks.push(i);
    }
    while (next.length && next[next.length - 1] === null) next.pop();
    lanes = next;
    width = Math.max(width, before.length, next.length, col + 1);
    return { col, before, after: next, joins, forks, merge: c.parents.length > 1 };
  });
  return { rows, width };
}

// Paleta de carriles (legible en tema claro y oscuro).
export const LANE_COLORS = ['#3399FF', '#1DB45A', '#F1A20D', '#E85D9E', '#8B6CEF', '#14B8C4', '#FF7A45', '#9CCC3C', '#FF505F', '#5B8DEF'];
export const laneColor = (i) => LANE_COLORS[i % LANE_COLORS.length];
