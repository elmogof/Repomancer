import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

// Muestra un diff unificado con números de línea y colores de añadido/eliminado.
export default function DiffView({ diff, maxHeight }) {
  const theme = useTheme();
  if (!diff) return <Typography color="text.secondary" sx={{ p: 2 }}>Sin diferencias.</Typography>;
  let oldN = 0, newN = 0;
  const rows = diff.replace(/\n$/, '').split('\n').map((line, i) => {
    let bg, color, o = '', n = '';
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) { oldN = +m[1]; newN = +m[2]; }
      bg = alpha(theme.palette.info.main, 0.12); color = theme.palette.info.main;
    } else if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(line)) {
      color = theme.palette.text.secondary;
    } else if (line.startsWith('+')) {
      bg = alpha(theme.palette.success.main, 0.15); n = newN++;
    } else if (line.startsWith('-')) {
      bg = alpha(theme.palette.error.main, 0.15); o = oldN++;
    } else if (line.startsWith('\\')) {
      color = theme.palette.text.secondary;
    } else {
      o = oldN++; n = newN++;
    }
    return (
      <Box key={i} sx={{ display: 'flex', bgcolor: bg, color }}>
        <Box component="span" sx={num}>{o}</Box>
        <Box component="span" sx={num}>{n}</Box>
        <Box component="span" sx={{ whiteSpace: 'pre', pl: 1, pr: 2 }}>{line || ' '}</Box>
      </Box>
    );
  });
  return (
    <Box sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 12.5, lineHeight: 1.6, overflow: 'auto', maxHeight, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
      <Box sx={{ minWidth: 'fit-content' }}>{rows}</Box>
    </Box>
  );
}

const num = { width: 48, flexShrink: 0, textAlign: 'right', pr: 1, color: 'text.disabled', userSelect: 'none', borderRight: 1, borderColor: 'divider' };
