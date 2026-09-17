// Introducción guiada, paso a paso, para Rutas y Transporte.
//
// Lo que pidió el dueño: «como en las páginas que te van explicando qué es cada cosa y vas dando
// clic». Cada paso resalta una parte de la pantalla (o la sección entera, navegando a ella) y
// explica qué es y para qué sirve, con «Siguiente», «Anterior» y «Saltar».
//
// Pensado para teléfono igual que para computadora:
//   - en pantalla ancha, la explicación va en una tarjeta junto a lo resaltado;
//   - en el teléfono va en una hoja fija abajo, con botones grandes, y lo resaltado queda visible
//     arriba (el menú lateral está escondido en un cajón, así que ese paso no resalta nada).
//
// Sin librerías nuevas: un recuadro con sombra enorme alrededor (el «agujero» en la pantalla
// oscurecida) y una tarjeta de MUI. Se abre sola la primera vez que cada persona entra al servicio
// y después con «Ver introducción». Lo visto se recuerda en el navegador (localStorage), envuelto
// en try: en modo privado simplemente vuelve a aparecer.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Box,
  Button,
  IconButton,
  MobileStepper,
  Paper,
  Portal,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';

const claveDe = (tour, userId) => `telconhn.tour.${tour}.${userId ?? 'anon'}`;

const leerVisto = (clave) => {
  try {
    return window.localStorage.getItem(clave) === 'visto';
  } catch {
    return false;
  }
};

const marcarVisto = (clave) => {
  try {
    window.localStorage.setItem(clave, 'visto');
  } catch {
    /* sin almacenamiento: la próxima vez vuelve a aparecer, no pasa nada */
  }
};

/**
 * Estado del tour de un servicio para la persona con sesión. Se abre solo la primera vez, cuando
 * `listo` es true (la pantalla ya cargó lo que el tour va a señalar).
 */
export const useTour = (tour, listo) => {
  const userId = useSelector((state) => state.session.user?.id);
  const clave = claveDe(tour, userId);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (listo && userId && !leerVisto(clave)) setAbierto(true);
  }, [listo, userId, clave]);

  const cerrar = useCallback(() => {
    marcarVisto(clave);
    setAbierto(false);
  }, [clave]);

  return { abierto, abrir: () => setAbierto(true), cerrar };
};

/// El primer elemento visible con `data-tour="<objetivo>"` (el menú existe dos veces: cajón y columna).
const buscarObjetivo = (objetivo) => {
  if (!objetivo) return null;
  const candidatos = document.querySelectorAll(`[data-tour="${objetivo}"]`);
  for (const el of candidatos) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
};

const MARGEN = 8;

const TourGuiado = ({ pasos, abierto, onCerrar }) => {
  const theme = useTheme();
  const telefono = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState(null);

  const paso = pasos[indice];

  useEffect(() => {
    if (abierto) setIndice(0);
  }, [abierto]);

  // Si el paso es de otra sección, se va a ella.
  useEffect(() => {
    if (!abierto || !paso?.ruta) return;
    if (pathname !== paso.ruta) navigate(paso.ruta);
  }, [abierto, paso, pathname, navigate]);

  // Medir lo que se resalta. Se reintenta un rato: la sección puede estar cargando.
  useLayoutEffect(() => {
    if (!abierto || !paso) return undefined;
    let vivo = true;
    let intentos = 0;
    let cuadro = 0;
    const medir = () => {
      if (!vivo) return;
      const el = buscarObjetivo(paso.objetivo);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        if (!telefono) el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } else {
        setRect(null);
        if (paso.objetivo && intentos < 40) {
          intentos += 1;
          cuadro = window.setTimeout(medir, 50);
        }
      }
    };
    medir();
    const alCambiar = () => medir();
    window.addEventListener('resize', alCambiar);
    window.addEventListener('scroll', alCambiar, true);
    return () => {
      vivo = false;
      window.clearTimeout(cuadro);
      window.removeEventListener('resize', alCambiar);
      window.removeEventListener('scroll', alCambiar, true);
    };
  }, [abierto, paso, pathname, telefono]);

  // Teclado: flechas y Escape.
  useEffect(() => {
    if (!abierto) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(pasos.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto, pasos.length, onCerrar]);

  if (!abierto || !paso) return null;

  const ultimo = indice === pasos.length - 1;
  // En computadora la tarjeta va al lado de lo resaltado (derecha si hay lugar, si no abajo);
  // sin objetivo, centrada.
  let posicionTarjeta = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  if (!telefono && rect) {
    const ancho = 360;
    const aLaDerecha = rect.left + rect.width + ancho + 24 < window.innerWidth;
    const cabeAbajo = rect.top + rect.height + 220 < window.innerHeight;
    if (aLaDerecha && rect.width < window.innerWidth * 0.5) {
      posicionTarjeta = {
        top: Math.max(16, Math.min(rect.top, window.innerHeight - 260)),
        left: rect.left + rect.width + 16,
      };
    } else if (cabeAbajo) {
      posicionTarjeta = {
        top: rect.top + rect.height + 12,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - ancho - 16)),
      };
    } else {
      posicionTarjeta = {
        top: Math.max(16, rect.top - 230),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - ancho - 16)),
      };
    }
  }

  return (
    <Portal>
      {/* Capa que oscurece y bloquea clics fuera del tour */}
      <Box
        onClick={onCerrar}
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: theme.zIndex.modal + 10,
          bgcolor: rect ? 'transparent' : 'rgba(0,0,0,0.55)',
        }}
      />
      {rect && (
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            top: rect.top - MARGEN,
            left: rect.left - MARGEN,
            width: rect.width + MARGEN * 2,
            height: rect.height + MARGEN * 2,
            borderRadius: 1.5,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            outline: `3px solid ${theme.palette.primary.main}`,
            zIndex: theme.zIndex.modal + 11,
            pointerEvents: 'none',
            transition: 'all 250ms ease',
          }}
        />
      )}
      <Paper
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        elevation={8}
        sx={{
          position: 'fixed',
          zIndex: theme.zIndex.modal + 12,
          ...(telefono
            ? {
                left: 8,
                right: 8,
                bottom: 'calc(8px + env(safe-area-inset-bottom))',
                borderRadius: 2,
                p: 2,
              }
            : { width: 360, p: 2.5, borderRadius: 2, ...posicionTarjeta }),
        }}
      >
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flexGrow: 1 }}>
            {paso.etiqueta && (
              <Typography variant="overline" color="primary" lineHeight={1.4}>
                {paso.etiqueta}
              </Typography>
            )}
            <Typography id="tour-titulo" variant="h6" fontWeight={700} lineHeight={1.25}>
              {paso.titulo}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onCerrar} aria-label="Cerrar la introducción">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-line' }}>
          {paso.texto}
        </Typography>
        {paso.consejo && (
          <Typography
            variant="body2"
            sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}
          >
            💡 {paso.consejo}
          </Typography>
        )}
        <MobileStepper
          variant="dots"
          steps={pasos.length}
          position="static"
          activeStep={indice}
          sx={{ bgcolor: 'transparent', px: 0, pt: 1.5, pb: 0 }}
          backButton={
            <Button
              size={telefono ? 'medium' : 'small'}
              disabled={indice === 0}
              onClick={() => setIndice(indice - 1)}
            >
              Anterior
            </Button>
          }
          nextButton={
            <Button
              size={telefono ? 'medium' : 'small'}
              variant="contained"
              onClick={() => (ultimo ? onCerrar() : setIndice(indice + 1))}
            >
              {ultimo ? 'Empezar' : 'Siguiente'}
            </Button>
          }
        />
        {!ultimo && (
          <Button size="small" color="inherit" onClick={onCerrar} sx={{ mt: 0.5, opacity: 0.7 }}>
            Saltar la introducción
          </Button>
        )}
      </Paper>
    </Portal>
  );
};

export default TourGuiado;
