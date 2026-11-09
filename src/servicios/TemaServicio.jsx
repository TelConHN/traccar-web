// Tamaños de Rutas y Transporte en el teléfono.
//
// Estas pantallas usan muchísimo `size="small"`: en la computadora, con mouse, está bien; en el
// teléfono eran textos de 10 a 12 px y botones de 24 a 31 px. En vez de repetir el arreglo en cada
// botón de cada pantalla se ajusta acá, y solo por debajo de `md`: la computadora se ve igual.
import { useCallback } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const temaDe = (base) => {
  const telefono = base.breakpoints.down('md');
  const angosto = base.breakpoints.down('sm');
  return createTheme(base, {
    typography: {
      body2: { [telefono]: { fontSize: '0.9375rem' } },
      subtitle2: { [telefono]: { fontSize: '0.9375rem' } },
      caption: { [telefono]: { fontSize: '0.8125rem' } },
    },
    components: {
      // Una pestaña que no cabe se alcanza deslizando, con flechas que avisan que hay más.
      MuiTabs: {
        defaultProps: {
          variant: 'scrollable',
          scrollButtons: 'auto',
          allowScrollButtonsMobile: true,
        },
      },
      // Sin mouse no hay «pasar por encima»: el aviso sale al tocar.
      MuiTooltip: { defaultProps: { enterTouchDelay: 0, leaveTouchDelay: 4000 } },
      MuiButton: {
        styleOverrides: {
          // Un botón al lado de un texto largo no se aplasta en dos renglones.
          // Los de ancho completo sí se reparten la fila: si no, dos juntos se salen de la pantalla.
          root: { flexShrink: 0, '&.MuiButton-fullWidth': { flexShrink: 1, minWidth: 0 } },
          sizeSmall: {
            [telefono]: { minHeight: 40, paddingInline: 10, fontSize: '0.8125rem' },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: { sizeSmall: { [telefono]: { minWidth: 44, minHeight: 44 } } },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            [telefono]: {
              // Con los botones ya de tamaño de dedo, el lugar que les reservaba la lista no
              // alcanzaba y quedaban encima del texto. Uno solo va al lado...
              '&&:has(> .MuiListItemSecondaryAction-root)': { paddingRight: 60 },
              // ...y dos o más, en su propia línea, para que el texto conserve todo el ancho.
              '&&:has(> .MuiListItemSecondaryAction-root .MuiIconButton-root ~ .MuiIconButton-root)':
                {
                  flexWrap: 'wrap',
                  paddingRight: 16,
                  '& > .MuiListItemSecondaryAction-root': {
                    position: 'static',
                    transform: 'none',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  },
                },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          // En el teléfono una etiqueta larga baja de renglón: cortada no se puede leer.
          root: { [telefono]: { height: 'auto', minHeight: 32, maxWidth: '100%' } },
          label: { [telefono]: { whiteSpace: 'normal', paddingBlock: 4 } },
          sizeSmall: { [telefono]: { minHeight: 30, fontSize: '0.8125rem' } },
        },
      },
      MuiInputBase: {
        // Con menos de 16 px, el iPhone agranda toda la página al tocar el campo.
        styleOverrides: { input: { [telefono]: { fontSize: 16 } } },
      },
      MuiOutlinedInput: {
        styleOverrides: { inputSizeSmall: { [telefono]: { paddingBlock: 10 } } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            [angosto]: {
              margin: 8,
              width: 'calc(100% - 16px)',
              maxWidth: 'calc(100% - 16px) !important',
              maxHeight: 'calc(100% - 16px)',
            },
          },
        },
      },
    },
  });
};

const TemaServicio = ({ children }) => {
  const tema = useCallback((base) => temaDe(base), []);
  return <ThemeProvider theme={tema}>{children}</ThemeProvider>;
};

export default TemaServicio;
