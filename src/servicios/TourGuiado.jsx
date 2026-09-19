// Introducción guiada, paso a paso, para el mapa, Rutas y Transporte.
//
// Lo que pidió el dueño: «como en las páginas que te van explicando qué es cada cosa y vas dando
// clic». Cada paso resalta una parte de la pantalla y explica qué es y para qué sirve, con
// «Siguiente» y «Anterior».
//
// La regla que manda, en cualquier pantalla: **la explicación nunca tapa lo que explica**.
//   - En computadora la tarjeta va al lado de lo resaltado (a la derecha, abajo o arriba, donde
//     entre) y nunca se sale de la pantalla.
//   - En el teléfono va en una hoja de ancho completo, arriba o abajo según dónde esté lo
//     resaltado: si está en la mitad de abajo (la tarjeta del vehículo, el menú de abajo), la hoja
//     sube. Es compacta —media pantalla como mucho, con el texto desplazable— y se pasa de paso
//     también deslizando el dedo.
//   - Si lo resaltado quedó fuera de la pantalla, se desplaza hasta mostrarlo.
//
// Cada paso puede traer:
//   objetivo       el `data-tour` de lo que se resalta ("css:<selector>" para un selector suelto,
//                  o una lista: se usa el primero que exista)
//   objetivoMovil  otro objetivo en el teléfono, donde algunas cosas viven escondidas (el menú
//                  lateral está detrás de ☰); `null` para no resaltar nada ahí
//   textoMovil, consejoMovil, tituloMovil  las mismas palabras, dichas para el teléfono
//   alMostrar      prepara la pantalla al llegar al paso (abrir la lista, abrir la tarjeta de un
//                  vehículo), para mostrar la cosa de verdad y no describirla de memoria
//   ruta           la sección que se abre para explicarlo
//
// Sin librerías nuevas: un recuadro con una sombra enorme alrededor (el «agujero» en la pantalla
// oscurecida) y una tarjeta de MUI. Se abre sola la primera vez que cada persona entra y después
// con «Ver introducción». Lo visto se recuerda en el navegador (localStorage), envuelto en try: en
// modo privado simplemente vuelve a aparecer.
//
// Hay una copia de este archivo en el panel admin (admin/frontend/src/common/components/tour/);
// solo cambia la clave donde se recuerda lo visto. Un cambio acá va también allá.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Box,
  Button,
  IconButton,
  LinearProgress,
  Paper,
  Portal,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme, keyframes } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';

const PREFIJO = 'telconhn.tour';
const claveDe = (tour, userId) => `${PREFIJO}.${tour}.${userId ?? 'anon'}`;

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
 * Estado del tour de una pantalla para la persona con sesión. Se abre solo la primera vez, cuando
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

/// El primer elemento visible y dentro de la pantalla con ese objetivo. El menú existe dos veces
/// (cajón y columna) y el cajón del teléfono queda montado fuera de la pantalla: esos no cuentan.
/// Acepta una lista: se usa el primero que exista (el título de la sección y, si no hay, la
/// sección entera).
const buscarObjetivo = (objetivo) => {
  if (!objetivo) return null;
  if (Array.isArray(objetivo)) {
    for (const uno of objetivo) {
      const el = buscarObjetivo(uno);
      if (el) return el;
    }
    return null;
  }
  const selector = objetivo.startsWith('css:') ? objetivo.slice(4) : `[data-tour="${objetivo}"]`;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
};

const MARGEN = 6;
const ANCHO_TARJETA = 360;
const ANCHO_MINIMO = 300;
// Por debajo de esto la explicación deja de leerse (se vio: a 150 px quedaba una línea y media).
const ALTO_LEGIBLE = 200;
// Teléfono acostado: ancho mínimo de la hoja cuando va al costado de lo resaltado.
const ANCHO_HOJA_COSTADO = 240;

const latido = keyframes`
  0%   { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 0 rgba(255,255,255,0.55); }
  70%  { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 10px rgba(255,255,255,0); }
  100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 0 rgba(255,255,255,0); }
`;

const mismoRect = (a, b) =>
  a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

const TourGuiado = ({ pasos, abierto, onCerrar }) => {
  const theme = useTheme();
  const telefono = useMediaQuery(theme.breakpoints.down('md'));
  const menosMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState(null);
  const toqueRef = useRef(null);

  const paso = pasos[indice];
  const objetivo =
    telefono && paso?.objetivoMovil !== undefined ? paso.objetivoMovil : paso?.objetivo;

  useEffect(() => {
    if (abierto) setIndice(0);
  }, [abierto]);

  // Si el paso es de otra sección, se va a ella; y si pide preparar la pantalla, se prepara.
  useEffect(() => {
    if (!abierto || !paso) return;
    if (paso.ruta && pathname !== paso.ruta) navigate(paso.ruta);
    paso.alMostrar?.({ telefono });
    // Solo al llegar al paso: `pathname` cambia por el propio navigate.
  }, [abierto, indice]);

  // Medir lo que se resalta. Lo que se señala puede aparecer un momento después (una sección que
  // carga, una tarjeta que se abre) o moverse (el mapa, un desplazamiento): se vuelve a medir un
  // par de veces por segundo mientras el tour está abierto, y en cada scroll o cambio de tamaño.
  useLayoutEffect(() => {
    if (!abierto || !paso) return undefined;
    let desplazado = false;
    const medir = () => {
      const el = buscarObjetivo(objetivo);
      if (!el) {
        setRect(null);
        return;
      }
      let r = el.getBoundingClientRect();
      // Una vez por paso: si no se ve entero, llevarlo a la vista. En el teléfono, además, si
      // es chico pero quedó a media pantalla sin lugar arriba ni abajo para una explicación que
      // se lea (pasa con el teléfono acostado), se lleva al borde de arriba: así toda la parte
      // de abajo queda para la explicación.
      const H = window.innerHeight;
      const fuera = r.top < 0 || r.bottom > H;
      const sinLugar =
        telefono &&
        r.height < H - ALTO_LEGIBLE - 40 &&
        Math.max(r.top, H - r.bottom) - MARGEN - 12 < ALTO_LEGIBLE;
      if ((fuera || sinLugar) && !desplazado && r.height < H * 0.8) {
        desplazado = true;
        el.scrollIntoView?.({
          block: sinLugar ? 'start' : 'center',
          behavior: menosMovimiento ? 'auto' : 'smooth',
        });
        r = el.getBoundingClientRect();
      }
      const nuevo = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect((antes) => (mismoRect(antes, nuevo) ? antes : nuevo));
    };
    medir();
    const reloj = window.setInterval(medir, 400);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.clearInterval(reloj);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
    // Por número de paso y no por el objeto: los pasos del mapa se rearman con cada posición
    // nueva, y eso reiniciaba la medición (y el desplazamiento) cada pocos segundos.
  }, [abierto, indice, objetivo, pathname, menosMovimiento, telefono]);

  const ir = useCallback(
    (delta) => setIndice((i) => Math.max(0, Math.min(pasos.length - 1, i + delta))),
    [pasos.length],
  );

  // Teclado: flechas y Escape.
  useEffect(() => {
    if (!abierto) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto, ir, onCerrar]);

  if (!abierto || !paso) return null;

  const ultimo = indice === pasos.length - 1;
  const titulo = (telefono && paso.tituloMovil) || paso.titulo;
  const texto = (telefono && paso.textoMovil) || paso.texto;
  const consejo = telefono && paso.consejoMovil !== undefined ? paso.consejoMovil : paso.consejo;
  const alto = window.innerHeight;
  const anchoPantalla = window.innerWidth;

  // Dónde va la explicación: siempre en el espacio libre que deja lo resaltado, y medida para
  // entrar en ese espacio (el texto se desplaza adentro si no alcanza).
  //
  // `aro` es lo que se dibuja resaltado. Casi siempre es lo resaltado entero; cuando es más
  // grande que el espacio que deja una explicación legible (una sección entera en el teléfono),
  // se resalta solo la parte que queda a la vista y el resto sigue debajo, como en cualquier
  // página que se desliza. Así lo resaltado nunca queda tapado ni la explicación ilegible.
  let posicion;
  let aro = rect;
  const abajoDe = rect ? rect.top + rect.height : 0;
  const libreArriba = rect ? rect.top - MARGEN - 12 : 0;
  const libreAbajo = rect ? alto - abajoDe - MARGEN - 12 : 0;
  if (telefono) {
    const libreIzq = rect ? rect.left - MARGEN - 12 : 0;
    const libreDer = rect ? anchoPantalla - (rect.left + rect.width) - MARGEN - 12 : 0;
    const acostado = anchoPantalla > alto;
    if (!rect) {
      posicion = {
        left: 8,
        right: 8,
        maxHeight: alto * 0.5,
        bottom: 'calc(8px + env(safe-area-inset-bottom))',
      };
    } else if (acostado && Math.max(libreIzq, libreDer) >= ANCHO_HOJA_COSTADO) {
      // Teléfono acostado: pantalla ancha y baja. Al costado entra a todo lo alto.
      const derecha = libreDer >= libreIzq;
      const ancho = Math.min(ANCHO_TARJETA, derecha ? libreDer : libreIzq);
      posicion = { top: 8, bottom: 8, width: ancho, ...(derecha ? { right: 8 } : { left: 8 }) };
    } else if (Math.max(libreArriba, libreAbajo) >= ALTO_LEGIBLE) {
      // Del lado con más espacio, con el alto justo de ese espacio.
      const arriba = libreArriba > libreAbajo;
      posicion = {
        left: 8,
        right: 8,
        maxHeight: Math.min(arriba ? libreArriba : libreAbajo, alto * 0.6),
        ...(arriba
          ? { top: 'calc(8px + env(safe-area-inset-top))' }
          : { bottom: 'calc(8px + env(safe-area-inset-bottom))' }),
      };
    } else {
      // Lo resaltado no deja lugar para una explicación que se lea (una sección entera, o algo
      // chico en una página que no se puede desplazar). La hoja va, a un alto legible, del lado
      // con más espacio, y se resalta la parte de lo resaltado que queda del otro lado.
      const altoHoja = Math.min(Math.max(ALTO_LEGIBLE, alto * 0.42), alto * 0.6);
      const hojaArriba = libreArriba > libreAbajo;
      let desde;
      let hasta;
      if (hojaArriba) {
        posicion = {
          left: 8,
          right: 8,
          maxHeight: altoHoja,
          top: 'calc(8px + env(safe-area-inset-top))',
        };
        desde = Math.max(rect.top, 8 + altoHoja + MARGEN + 12);
        hasta = Math.min(abajoDe, alto - MARGEN - 2);
      } else {
        posicion = {
          left: 8,
          right: 8,
          maxHeight: altoHoja,
          bottom: 'calc(8px + env(safe-area-inset-bottom))',
        };
        desde = Math.max(rect.top, MARGEN + 2);
        hasta = Math.min(abajoDe, alto - altoHoja - 8 - MARGEN - 12);
      }
      aro = { ...rect, top: desde, height: Math.max(0, hasta - desde) };
    }
  } else if (!rect) {
    posicion = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: ANCHO_TARJETA,
      maxHeight: 'calc(100vh - 32px)',
    };
  } else {
    // Se prueban los cuatro lados en orden (derecha, abajo, arriba, izquierda) y se usa el primero
    // donde entra, achicando la tarjeta hasta ANCHO_MINIMO si hace falta.
    const libreDerecha = anchoPantalla - (rect.left + rect.width) - MARGEN - 28;
    const libreIzquierda = rect.left - MARGEN - 28;
    const alinearIzq = (ancho) => Math.max(16, Math.min(rect.left, anchoPantalla - ancho - 16));
    const alCostado = (x, ancho) => {
      // Alineada con lo resaltado; si está en la mitad de abajo, por su borde de abajo.
      const enLaMitadDeAbajo = rect.top + rect.height / 2 > alto / 2;
      return enLaMitadDeAbajo
        ? { bottom: Math.max(16, alto - abajoDe), left: x, width: ancho, maxHeight: alto - 32 }
        : {
            top: Math.max(16, rect.top),
            left: x,
            width: ancho,
            maxHeight: alto - Math.max(16, rect.top) - 16,
          };
    };
    if (libreDerecha >= ANCHO_MINIMO) {
      const ancho = Math.min(ANCHO_TARJETA, libreDerecha);
      posicion = alCostado(rect.left + rect.width + MARGEN + 12, ancho);
    } else if (libreAbajo >= 220) {
      posicion = {
        top: abajoDe + MARGEN + 12,
        left: alinearIzq(ANCHO_TARJETA),
        width: ANCHO_TARJETA,
        maxHeight: libreAbajo,
      };
    } else if (libreArriba >= 220) {
      posicion = {
        bottom: alto - rect.top + MARGEN + 12,
        left: alinearIzq(ANCHO_TARJETA),
        width: ANCHO_TARJETA,
        maxHeight: libreArriba,
      };
    } else if (libreIzquierda >= ANCHO_MINIMO) {
      // Lo resaltado es una sección entera: la tarjeta va sobre el menú, a su izquierda.
      const ancho = Math.min(ANCHO_TARJETA, libreIzquierda);
      posicion = alCostado(rect.left - MARGEN - 12 - ancho, ancho);
    } else {
      // Último recurso (lo resaltado ocupa toda la pantalla): la esquina de abajo.
      posicion = { bottom: 24, right: 24, width: ANCHO_TARJETA, maxHeight: 'calc(100vh - 48px)' };
    }
  }

  const hayAro = Boolean(aro && aro.height > 0);

  // Deslizar el dedo en la hoja: a la izquierda, siguiente; a la derecha, anterior.
  const alTocar = (e) => {
    const t = e.touches[0];
    toqueRef.current = { x: t.clientX, y: t.clientY };
  };
  const alSoltar = (e) => {
    if (!toqueRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - toqueRef.current.x;
    const dy = t.clientY - toqueRef.current.y;
    toqueRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && !ultimo) ir(1);
      if (dx > 0) ir(-1);
    }
  };

  return (
    <Portal>
      {/* Capa que oscurece y bloquea los toques fuera del tour. Tocarla NO cierra: en el
          teléfono un toqueRef sin querer te sacaba a mitad del recorrido. Se cierra con la X. */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: theme.zIndex.modal + 10,
          bgcolor: hayAro ? 'transparent' : 'rgba(0,0,0,0.55)',
        }}
      />
      {hayAro && (
        <Box
          // Una por paso: así el anillo vuelve a latir cada vez que cambia lo que se señala.
          key={indice}
          aria-hidden
          sx={{
            position: 'fixed',
            // Dentro de la pantalla: con lo resaltado pegado al borde (el menú de abajo) el anillo
            // quedaba cortado.
            top: Math.max(2, aro.top - MARGEN),
            left: Math.max(2, aro.left - MARGEN),
            width:
              Math.min(anchoPantalla - 2, aro.left + aro.width + MARGEN) -
              Math.max(2, aro.left - MARGEN),
            height:
              Math.min(alto - 2, aro.top + aro.height + MARGEN) - Math.max(2, aro.top - MARGEN),
            borderRadius: 1.5,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            outline: `3px solid ${theme.palette.primary.main}`,
            zIndex: theme.zIndex.modal + 11,
            pointerEvents: 'none',
            transition: menosMovimiento ? 'none' : 'all 250ms ease',
            animation: menosMovimiento ? 'none' : `${latido} 1.8s ease-out 2`,
          }}
        />
      )}
      <Paper
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        aria-describedby="tour-texto"
        elevation={8}
        onTouchStart={alTocar}
        onTouchEnd={alSoltar}
        sx={{
          position: 'fixed',
          zIndex: theme.zIndex.modal + 12,
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          ...posicion,
        }}
      >
        <LinearProgress
          variant="determinate"
          value={((indice + 1) / pasos.length) * 100}
          aria-label={`Paso ${indice + 1} de ${pasos.length}`}
          sx={{ height: 3, flexShrink: 0 }}
        />
        {/* Lo que se lee: se desplaza si no entra; los botones quedan siempre a la vista */}
        <Box
          sx={{ px: telefono ? 2 : 2.5, pt: telefono ? 1.25 : 2, overflowY: 'auto', minHeight: 0 }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              {paso.etiqueta && (
                <Typography
                  variant="overline"
                  color="primary"
                  lineHeight={1.4}
                  sx={{ display: 'block' }}
                >
                  {paso.etiqueta}
                </Typography>
              )}
              <Typography
                id="tour-titulo"
                fontWeight={700}
                lineHeight={1.25}
                sx={{ fontSize: telefono ? '1.05rem' : '1.2rem' }}
              >
                {titulo}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={onCerrar}
              aria-label="Cerrar la introducción"
              sx={{ mt: -0.5, mr: -1 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Typography
            id="tour-texto"
            color="text.secondary"
            sx={{
              mt: 0.75,
              whiteSpace: 'pre-line',
              fontSize: telefono ? '0.875rem' : '0.9rem',
              lineHeight: 1.5,
            }}
          >
            {texto}
          </Typography>
          {consejo && (
            <Typography
              sx={{
                mt: 1,
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontSize: telefono ? '0.8125rem' : '0.85rem',
                lineHeight: 1.45,
              }}
            >
              💡 {consejo}
            </Typography>
          )}
        </Box>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ px: telefono ? 1.5 : 2, py: telefono ? 1 : 1.5, flexShrink: 0 }}
        >
          <Button
            disabled={indice === 0}
            onClick={() => ir(-1)}
            sx={{ minHeight: 44, minWidth: 88 }}
          >
            Anterior
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {indice + 1} de {pasos.length}
          </Typography>
          <Button
            variant="contained"
            onClick={() => (ultimo ? onCerrar() : ir(1))}
            sx={{ minHeight: 44, minWidth: 104 }}
          >
            {ultimo ? 'Empezar' : 'Siguiente'}
          </Button>
        </Stack>
        {!telefono && !ultimo && (
          <Button
            size="small"
            color="inherit"
            onClick={onCerrar}
            sx={{ alignSelf: 'flex-start', ml: 1.5, mb: 1, mt: -0.5, opacity: 0.7 }}
          >
            Saltar la introducción
          </Button>
        )}
      </Paper>
    </Portal>
  );
};

export default TourGuiado;
