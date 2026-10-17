import { alpha, createTheme } from '@mui/material/styles';

// Colores del logo de Repomancer: violeta del sombrero (brand) y azul noche del fondo (primaryDark).
export const brand = {
  50: '#F3F2FF', 100: '#E6E3FE', 200: '#CCC7FC', 300: '#ABA3F9', 400: '#8F86F7',
  500: '#6C61EC', 600: '#5A4FE6', 700: '#4A3FCC', 800: '#3B32A3', 900: '#2C2678',
};
export const primaryDark = {
  50: '#ECEEF6', 100: '#D9DDEC', 200: '#B0B7D3', 300: '#8089B0', 400: '#545E88',
  500: '#3E476E', 600: '#2E3659', 700: '#212846', 800: '#182038', 900: '#10162B',
};
const night = '#0A0E1C';
export const grey = {
  50: '#F3F6F9', 100: '#E5EAF2', 200: '#DAE2ED', 300: '#C7D0DD', 400: '#B0B8C4',
  500: '#9DA8B7', 600: '#6B7A90', 700: '#434D5B', 800: '#303740', 900: '#1C2025',
};
const success = { light: '#6AE79C', main: '#1AA251', dark: '#1AA251', darkMain: '#1DB45A' };
const error = { light: '#FF99A2', main: '#EB0014', darkMain: '#FF505F' };
const warning = { light: '#FFDC48', main: '#DEA500', darkMain: '#F1A20D' };

export const fontHeading = '"General Sans", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const fontBody = '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const fontCode = 'Menlo, Consolas, "Droid Sans Mono", "Roboto Mono", monospace';

export default function buildTheme(mode) {
  const dark = mode === 'dark';
  const divider = dark ? alpha(primaryDark[500], 0.35) : grey[200];
  const paper = dark ? alpha(primaryDark[800], 0.55) : alpha('#fff', 0.75);
  const glass = dark ? alpha(primaryDark[900], 0.72) : alpha('#fff', 0.8);
  const hover = dark ? alpha(primaryDark[600], 0.35) : alpha(grey[100], 0.7);
  const primaryMain = dark ? brand[400] : brand[600];

  return createTheme({
    palette: {
      mode,
      primary: { ...brand, main: primaryMain, light: brand[300], dark: brand[700], contrastText: '#fff' },
      secondary: { main: dark ? primaryDark[300] : grey[700] },
      success: { ...success, main: dark ? success.darkMain : success.main },
      error: { ...error, main: dark ? error.darkMain : error.main },
      warning: { ...warning, main: dark ? warning.darkMain : warning.main },
      info: { main: dark ? brand[300] : brand[600] },
      grey,
      divider,
      background: dark
        ? { default: night, paper: primaryDark[900] }
        : { default: '#fff', paper: '#fff' },
      text: dark
        ? { primary: '#fff', secondary: grey[400], tertiary: grey[500] }
        : { primary: grey[900], secondary: grey[700], tertiary: grey[600] },
      action: { hover, selected: alpha(primaryMain, dark ? 0.12 : 0.08) },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: fontBody,
      fontFamilyCode: fontCode,
      h1: { fontFamily: fontHeading, fontWeight: 600, letterSpacing: '-0.02em' },
      h2: { fontFamily: fontHeading, fontWeight: 600, letterSpacing: '-0.02em' },
      h3: { fontFamily: fontHeading, fontWeight: 600 },
      h4: { fontFamily: fontHeading, fontWeight: 600 },
      h5: { fontFamily: fontHeading, fontWeight: 600 },
      h6: { fontFamily: fontHeading, fontWeight: 600, fontSize: '1.125rem' },
      subtitle1: { fontWeight: 500 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
      overline: { fontWeight: 600, letterSpacing: '0.1em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Reserva siempre el hueco de la barra de desplazamiento: si una lista se acorta (p. ej. al filtrar),
          // la página no se desplaza a los lados al desaparecer la barra.
          html: { scrollbarGutter: 'stable' },
          // Entrada suave de pantallas y pestañas: aparece y sube unos píxeles.
          '@keyframes gm-enter': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
          '.gm-enter': { animation: 'gm-enter .22s cubic-bezier(.2,.7,.3,1) both' },
          '@media (prefers-reduced-motion: reduce)': { '.gm-enter': { animation: 'none' } },
          body: {
            backgroundColor: dark ? night : '#fff',
            backgroundImage: dark
              ? `radial-gradient(1200px 600px at 85% -10%, ${alpha(brand[700], 0.22)}, transparent 60%), radial-gradient(900px 500px at 0% 110%, ${alpha(primaryDark[600], 0.35)}, transparent 60%)`
              : `radial-gradient(1200px 600px at 85% -10%, ${alpha(brand[100], 0.6)}, transparent 60%)`,
            backgroundAttachment: 'fixed',
            minHeight: '100vh',
          },
          'code, pre': { fontFamily: fontCode },
          code: {
            fontSize: '0.85em', padding: '1px 5px', borderRadius: 5,
            backgroundColor: dark ? alpha(primaryDark[600], 0.5) : grey[50],
            border: `1px solid ${divider}`,
          },
          '::selection': { backgroundColor: alpha(brand[500], 0.35) },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: dark ? primaryDark[600] : grey[300], borderRadius: 8,
            border: `2px solid ${dark ? night : '#fff'}`,
          },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'transparent' },
        styleOverrides: {
          root: {
            backgroundColor: glass,
            backdropFilter: 'blur(12px)',
            boxShadow: 'none',
            borderBottom: `1px solid ${divider}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: dark ? alpha(primaryDark[900], 0.6) : alpha('#fff', 0.7),
            backdropFilter: 'blur(12px)',
            borderRight: `1px solid ${divider}`,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: {
            backgroundColor: paper,
            backdropFilter: 'blur(8px)',
            borderColor: divider,
            ...(dark && { boxShadow: `inset 0 1px 0 ${alpha(primaryDark[400], 0.15)}` }),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: paper,
            backdropFilter: 'blur(12px)',
            border: `1px solid ${divider}`,
            boxShadow: dark ? `0 8px 32px ${alpha('#000', 0.4)}` : `0 8px 32px ${alpha(grey[300], 0.4)}`,
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            backgroundColor: paper,
            backdropFilter: 'blur(8px)',
            borderColor: divider,
            '&:before': { display: 'none' },
          },
        },
      },
      // Los menús no bloquean el scroll: así la barra no desaparece ni la página se desplaza al abrirlos.
      MuiMenu: {
        defaultProps: { disableScrollLock: true },
        styleOverrides: {
          paper: {
            marginTop: 4,
            backgroundColor: dark ? alpha(primaryDark[800], 0.85) : alpha('#fff', 0.9),
            backdropFilter: 'blur(12px)',
            border: `1px solid ${divider}`,
            boxShadow: dark ? `0 4px 24px ${alpha('#000', 0.5)}` : `0 4px 24px ${alpha(grey[300], 0.5)}`,
          },
        },
      },
      MuiPopover: {
        defaultProps: { disableScrollLock: true },
        styleOverrides: { paper: { backgroundImage: 'none' } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: dark ? alpha(primaryDark[800], 0.88) : alpha('#fff', 0.92),
            backdropFilter: 'blur(16px)',
            border: `1px solid ${divider}`,
            backgroundImage: 'none',
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            '&:not(.MuiBackdrop-invisible)': {
              backgroundColor: dark ? alpha('#05070A', 0.6) : alpha(grey[900], 0.3),
              backdropFilter: 'blur(4px)',
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: dark ? alpha(primaryDark[700], 0.9) : alpha(grey[900], 0.9),
            backdropFilter: 'blur(8px)',
            border: `1px solid ${dark ? alpha(primaryDark[500], 0.5) : 'transparent'}`,
            fontWeight: 500,
            fontSize: '0.75rem',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10 },
          containedPrimary: {
            color: '#fff',
            backgroundImage: `linear-gradient(180deg, ${brand[400]} 0%, ${brand[600]} 100%)`,
            border: `1px solid ${brand[500]}`,
            boxShadow: `inset 0 1px 0 ${alpha(brand[200], 0.4)}, 0 2px 8px ${alpha(brand[600], 0.3)}`,
            textShadow: `0 1px 1px ${alpha(brand[900], 0.4)}`,
            '&:hover': { backgroundImage: `linear-gradient(180deg, ${brand[500]} 0%, ${brand[700]} 100%)` },
            '&.Mui-disabled': { backgroundImage: 'none', border: `1px solid ${divider}`, boxShadow: 'none', textShadow: 'none' },
          },
          outlined: {
            backgroundColor: dark ? alpha(primaryDark[800], 0.5) : alpha('#fff', 0.6),
            borderColor: dark ? primaryDark[600] : grey[200],
            color: dark ? grey[100] : grey[900],
            '&:hover': {
              backgroundColor: dark ? alpha(primaryDark[700], 0.7) : grey[50],
              borderColor: dark ? primaryDark[500] : grey[300],
            },
          },
          text: { '&:hover': { backgroundColor: hover } },
        },
      },
      MuiButtonGroup: {
        styleOverrides: { grouped: { borderColor: dark ? `${primaryDark[600]} !important` : undefined } },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            '&:hover': { backgroundColor: hover },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 8 },
          outlined: {
            backgroundColor: dark ? alpha(primaryDark[700], 0.5) : alpha(grey[50], 0.8),
            borderColor: dark ? primaryDark[600] : grey[200],
          },
          outlinedPrimary: {
            backgroundColor: alpha(brand[500], dark ? 0.15 : 0.08),
            borderColor: alpha(brand[400], 0.5),
            color: dark ? brand[200] : brand[700],
          },
          outlinedSuccess: { backgroundColor: alpha(success.main, 0.12), borderColor: alpha(success.main, 0.45) },
          outlinedWarning: { backgroundColor: alpha(warning.main, 0.12), borderColor: alpha(warning.main, 0.45) },
          outlinedError: { backgroundColor: alpha(error.main, 0.12), borderColor: alpha(error.main, 0.45) },
          outlinedInfo: { backgroundColor: alpha(brand[500], 0.12), borderColor: alpha(brand[400], 0.45) },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&:hover': { backgroundColor: hover },
            '&.Mui-selected': {
              backgroundColor: alpha(primaryMain, dark ? 0.12 : 0.08),
              color: dark ? brand[300] : brand[600],
              '& .MuiListItemIcon-root': { color: dark ? brand[300] : brand[600] },
              '&:hover': { backgroundColor: alpha(primaryMain, dark ? 0.18 : 0.12) },
            },
          },
        },
      },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 38 } } },
      MuiListSubheader: {
        styleOverrides: {
          root: {
            backgroundColor: dark ? alpha(primaryDark[900], 0.85) : alpha('#fff', 0.85),
            backdropFilter: 'blur(8px)',
            fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
            color: dark ? grey[400] : grey[600],
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: dark ? alpha(primaryDark[800], 0.5) : alpha('#fff', 0.7),
            '& .MuiOutlinedInput-notchedOutline': { borderColor: dark ? primaryDark[600] : grey[200] },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: dark ? primaryDark[400] : grey[300] },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(brand[500], dark ? 0.3 : 0.2)}` },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: brand[500], borderWidth: 1 },
            // Con etiqueta flotante, el anillo de foco (una sombra sin hueco) cruzaría la etiqueta:
            // en esos campos se resalta el borde, que sí respeta el hueco de la etiqueta.
            '.MuiInputLabel-root + &.Mui-focused': { boxShadow: 'none' },
            '.MuiInputLabel-root + &.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 2 },
          },
        },
      },
      MuiTabs: {
        styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } },
      },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: divider },
          head: { fontWeight: 600, color: dark ? grey[300] : grey[700] },
        },
      },
      MuiTableRow: {
        styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: hover } } },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: divider } } },
      MuiAlert: {
        styleOverrides: {
          root: { border: '1px solid', backdropFilter: 'blur(8px)' },
          standardError: { backgroundColor: alpha(error.main, dark ? 0.12 : 0.06), borderColor: alpha(error.main, 0.35) },
          standardSuccess: { backgroundColor: alpha(success.main, dark ? 0.12 : 0.06), borderColor: alpha(success.main, 0.35) },
          standardWarning: { backgroundColor: alpha(warning.main, dark ? 0.12 : 0.06), borderColor: alpha(warning.main, 0.35) },
          standardInfo: { backgroundColor: alpha(brand[500], dark ? 0.12 : 0.06), borderColor: alpha(brand[400], 0.35) },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: dark ? alpha(primaryDark[700], 0.9) : alpha(grey[900], 0.9),
            backdropFilter: 'blur(12px)', color: '#fff',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4, backgroundColor: alpha(brand[500], 0.15) },
          bar: { borderRadius: 4 },
        },
      },
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { fontWeight: 500, color: dark ? brand[300] : brand[600] } },
      },
      MuiAvatar: {
        styleOverrides: { root: { border: `2px solid ${dark ? primaryDark[600] : grey[200]}` } },
      },
    },
  });
}
