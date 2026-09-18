// /seguir/:codigo — lo que ve quien sigue el bus con un enlace. Pública, sin sesión, sin menú y
// sin enlaces al resto de la aplicación.
//
// Tres clases de enlace y cuatro tipos de transporte, y la página habla como cada uno:
//   - personal:  «A 6 min de tu parada» en grande, su parada resaltada y su bus en el mapa.
//   - grupo:     los buses que atienden a la empresa o al grupo, con su próxima parada.
//   - recorrido: el trazo de la línea, las paradas en orden con cuánto falta, y los buses encima.
//
// Mismo mapa de Google que la aplicación GPS de TelConHN (con opción satélite) y los colores de la
// marca que publica el servidor. Tiene su propio mapa —no el MapView de Traccar— porque ese lee
// preferencias de una sesión que acá no existe. En el teléfono: mapa arriba y panel abajo; en la
// computadora: panel a la izquierda.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { googleProtocol } from 'maplibre-google-maps';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CssBaseline,
  LinearProgress,
  Paper,
  Stack,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  createTheme,
  useMediaQuery,
} from '@mui/material';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import PlaceIcon from '@mui/icons-material/Place';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { seguirPublico } from './api';

const AMARILLO = '#FFC800';
const VERDE = '#138a19';
const OSCURO = '#18181b';
const AZUL_LINEA = '#1a73e8';

try {
  maplibregl.addProtocol('google', googleProtocol);
} catch {
  /* ya registrado por la aplicación */
}

const TIPO = {
  escolar: { nombre: 'Transporte escolar', vehiculo: 'el bus escolar', persona: 'estudiante' },
  personal: { nombre: 'Transporte de personal', vehiculo: 'tu bus', persona: 'colaborador' },
  linea: { nombre: 'Ruta pública', vehiculo: 'el bus', persona: 'pasajero' },
  otro: { nombre: 'Shuttle y turismo', vehiculo: 'el shuttle', persona: 'pasajero' },
};

const hora = (d) => new Date(d).toLocaleTimeString('es-HN', { hour: 'numeric', minute: '2-digit' });
const fechaCorta = (d) =>
  new Date(d).toLocaleDateString('es-HN', { day: 'numeric', month: 'long' });

const tema = createTheme({
  palette: {
    mode: 'light',
    primary: { main: OSCURO },
    secondary: { main: AMARILLO },
    success: { main: VERDE },
    background: { default: '#f4f4f5', paper: '#ffffff' },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif' },
});

// ── Mapa ────────────────────────────────────────────────────────────────────

const estiloGoogle = (tipo, key) => ({
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tileSize: 256,
      maxzoom: 20,
      attribution: '© Google',
      tiles: key
        ? [
            `google://${tipo === 'satelite' ? 'satellite' : 'roadmap'}/{z}/{x}/{y}?key=${key}${tipo === 'satelite' ? '&layerType=layerRoadmap' : ''}`,
          ]
        : [0, 1, 2, 3].map(
            (i) =>
              `https://mt${i}.google.com/vt/lyrs=${tipo === 'satelite' ? 'y' : 'm'}&hl=es&x={x}&y={y}&z={z}&s=Ga`,
          ),
    },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

/// Flecha para marcar el sentido del recorrido sobre la línea.
function imagenFlecha() {
  const lado = 28;
  const c = document.createElement('canvas');
  c.width = lado;
  c.height = lado;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(9, 7);
  g.lineTo(18, 14);
  g.lineTo(9, 21);
  g.stroke();
  return g.getImageData(0, 0, lado, lado);
}

const elementoParada = ({ orden, mia, terminal, etiqueta }) => {
  const el = document.createElement('div');
  // Sin `position`: la hoja de estilos de maplibre le da `position:absolute` a cada marcador y así
  // queda pegado a su coordenada. Con `position:relative` vuelve al flujo del documento —se estira
  // al ancho del mapa y empuja hacia abajo a los marcadores que siguen—, y por eso un bus aparecía
  // «fuera de la carretera» mientras otro caía bien.
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
  const tam = mia ? 34 : 24;
  const circulo = document.createElement('div');
  circulo.style.cssText =
    `width:${tam}px;height:${tam}px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
    `font:700 ${mia ? 14 : 12}px Roboto,Arial;box-shadow:0 1px 4px rgba(0,0,0,.35);` +
    (mia
      ? `background:${AMARILLO};color:${OSCURO};border:3px solid ${OSCURO};`
      : terminal
        ? `background:${OSCURO};color:#fff;border:2px solid #fff;`
        : `background:#fff;color:${AZUL_LINEA};border:3px solid ${AZUL_LINEA};`);
  circulo.textContent = mia ? '★' : String(orden ?? '');
  el.appendChild(circulo);
  // «Salida y regreso» escrito en el mapa: dónde arranca el bus y si vuelve al mismo punto es de
  // las primeras cosas que se preguntan, y un círculo oscuro sin texto no lo contesta.
  if (etiqueta) {
    const texto = document.createElement('div');
    // Fuera del flujo: si contara para el alto, el círculo dejaría de caer sobre la coordenada.
    texto.style.cssText = `position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:2px;white-space:nowrap;background:${OSCURO};color:#fff;font:600 10px Roboto,Arial;padding:1px 5px;border-radius:7px;`;
    texto.textContent = etiqueta;
    el.appendChild(texto);
  }
  return el;
};

/**
 * El bus en el mapa, con forma de alfiler: el ícono va ARRIBA y la punta toca el lugar exacto.
 *
 * Antes era un círculo de 46 px centrado en la posición, y a la vista de una ciudad ese círculo
 * tapaba la calle por la que iba el bus: parecía que andaba por fuera de la carretera. Medido con
 * el motor de ruteo, cada posición cae a menos de 10 cm de una calle real; lo que fallaba era el
 * dibujo. La punta y el puntito oscuro dejan ver la calle debajo.
 *
 * El alfiler mide 56 px de alto y se ancla abajo (`anchor: 'bottom'` al crear el marcador).
 */
const elementoBus = (etiqueta) => {
  const el = document.createElement('div');
  el.style.cssText = 'width:44px;height:56px;cursor:pointer;';
  el.innerHTML = `
    <div data-rumbo style="position:absolute;left:0;top:0;width:44px;height:44px;transition:transform .8s ease;">
      <div style="position:absolute;left:50%;top:-6px;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${OSCURO};"></div>
    </div>
    <div style="position:absolute;left:5px;top:5px;width:34px;height:34px;border-radius:50%;background:${AMARILLO};border:3px solid ${OSCURO};box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="${OSCURO}"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17m9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m1.5-6H6V6h12z"/></svg>
    </div>
    <div style="position:absolute;left:50%;top:38px;margin-left:-1.5px;width:3px;height:12px;background:${OSCURO};"></div>
    <div style="position:absolute;left:50%;bottom:-3px;margin-left:-3px;width:6px;height:6px;border-radius:50%;background:${OSCURO};border:1.5px solid #fff;"></div>
`;
  // La etiqueta sale de nombres que escribe el cliente: va como texto, nunca como HTML.
  if (etiqueta) {
    const texto = document.createElement('div');
    texto.style.cssText = `position:absolute;left:50%;top:-20px;transform:translateX(-50%);white-space:nowrap;background:${OSCURO};color:#fff;font:600 11px Roboto,Arial;padding:1px 6px;border-radius:8px;`;
    texto.textContent = etiqueta;
    el.appendChild(texto);
  }
  return el;
};

/// Todo lo que va en el mapa, sacado de la respuesta según la clase de enlace.
///
/// Cada recorrido lleva la MISMA clave que el bus que lo hace: con dos o tres buses de recorridos
/// distintos encima del mismo mapa, todos los trazos se veían iguales y no había forma de saber
/// cuál era de cuál. Con la clave, tocar un bus deja su recorrido entero y apaga los demás.
function capasDe(datos) {
  if (!datos) return { lineas: [], paradas: [], buses: [] };
  if (datos.clase === 'recorrido') {
    return {
      // Un solo recorrido y todos los buses encima: no hay cuál es de cuál que aclarar.
      lineas: [{ clave: null, coordenadas: datos.linea }],
      paradas: datos.paradas.map((p, i) => ({
        ...p,
        terminal: i === 0,
        etiqueta:
          i === 0
            ? datos.circular
              ? 'Salida y regreso'
              : 'Salida'
            : !datos.circular && i === datos.paradas.length - 1
              ? 'Última parada'
              : null,
      })),
      buses: datos.buses
        .filter((b) => b.posicion)
        .map((b) => ({
          clave: `b${b.numero}`,
          etiqueta: datos.buses.length > 1 ? `Bus ${b.numero}` : '',
          ...b.posicion,
        })),
    };
  }
  if (datos.clase === 'grupo') {
    return {
      lineas: datos.buses
        .map((b, i) => ({ clave: `g${i}`, coordenadas: b.linea }))
        .filter((l) => l.coordenadas?.length > 1),
      paradas: datos.buses
        .flatMap((b) => b.paradas)
        .filter((p, i, arr) => arr.findIndex((x) => x.lat === p.lat && x.lon === p.lon) === i),
      buses: datos.buses
        .map((b, i) =>
          b.posicion
            ? { clave: `g${i}`, etiqueta: b.recorrido.split(' · ')[0], ...b.posicion }
            : null,
        )
        .filter(Boolean),
    };
  }
  const viajes = datos.pasajeros.flatMap((p) => p.viajes);
  return {
    lineas: viajes
      .map((v, i) => ({ clave: `p${i}`, coordenadas: v.linea }))
      .filter((l) => l.coordenadas?.length > 1),
    paradas: viajes.map((v) => ({ ...v.parada, mia: true })),
    buses: viajes
      .map((v, i) => (v.posicion ? { clave: `p${i}`, etiqueta: '', ...v.posicion } : null))
      .filter(Boolean),
  };
}

/// Lo que le falta al bus: su recorrido desde donde va hasta el final de la vuelta.
///
/// Es lo que contesta «¿por dónde viene el mío?» cuando dos buses hacen el MISMO recorrido —el
/// caso normal de una escuela—: ahí no hay dos trazos que separar, y apagar el único que hay no
/// dice nada. Con esto, elegir un bus dibuja su tramo pendiente y deja el resto tenue.
///
/// La proyección es plana (metros por grado a esta latitud): sobre una ciudad el error es de
/// centímetros y evita traer una librería de geometría a una página pública que tiene que abrir
/// rápido en un teléfono.
function loQueLeFalta(coordenadas, bus) {
  if (!coordenadas || coordenadas.length < 2 || !bus) return [];
  const kx = 111320 * Math.cos((bus.lat * Math.PI) / 180);
  const ky = 110540;
  let mejor = { distancia: Infinity, indice: 0, punto: coordenadas[0] };
  for (let i = 1; i < coordenadas.length; i += 1) {
    const [la1, lo1] = coordenadas[i - 1];
    const [la2, lo2] = coordenadas[i];
    const dx = (lo2 - lo1) * kx;
    const dy = (la2 - la1) * ky;
    const largo = dx * dx + dy * dy;
    const t =
      largo === 0
        ? 0
        : Math.max(0, Math.min(1, ((bus.lon - lo1) * kx * dx + (bus.lat - la1) * ky * dy) / largo));
    const punto = [la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t];
    const ex = (bus.lon - punto[1]) * kx;
    const ey = (bus.lat - punto[0]) * ky;
    const distancia = ex * ex + ey * ey;
    if (distancia < mejor.distancia) mejor = { distancia, indice: i, punto };
  }
  // Más de 300 m fuera del recorrido: va desviado y marcarle un tramo sería inventarlo.
  if (Math.sqrt(mejor.distancia) > 300) return [];
  return [mejor.punto, ...coordenadas.slice(mejor.indice)];
}

/// Con un bus elegido: lo suyo con `activo`, lo demás con `apagado`. Sin elegir, todo igual.
const segunElegido = (elegido, activo, apagado) =>
  elegido == null ? activo : ['case', ['==', ['get', 'clave'], elegido], activo, apagado];

// ── Panel ───────────────────────────────────────────────────────────────────

const Minutos = ({ minutos, grande }) => {
  if (minutos == null)
    return (
      <Typography variant={grande ? 'h4' : 'body2'} color="text.secondary">
        —
      </Typography>
    );
  const llegando = minutos <= 1;
  return (
    <Chip
      label={llegando ? 'Llegando' : `${minutos} min`}
      size={grande ? 'medium' : 'small'}
      sx={{
        fontWeight: 700,
        bgcolor: llegando ? VERDE : minutos <= 5 ? AMARILLO : 'action.selected',
        color: llegando ? '#fff' : OSCURO,
      }}
    />
  );
};

const EstadoViaje = ({ viaje, tipo, onVer }) => {
  let grande;
  let detalle;
  let color = OSCURO;
  if (!viaje.enRuta) {
    grande = 'Fuera de horario';
    detalle = `${tipo.vehiculo.charAt(0).toUpperCase()}${tipo.vehiculo.slice(1)} aparece acá desde 15 min antes de salir. Horario: ${viaje.horario}.`;
    color = 'text.secondary';
  } else if (viaje.porSalir) {
    grande = 'Por salir';
    detalle = `Sale a las ${viaje.horario.split('–')[0]}.`;
  } else if (viaje.sinSenal) {
    grande = 'Sin señal por ahora';
    detalle = 'Puede estar en una zona sin cobertura. Se actualiza solo.';
    color = '#b45309';
  } else if (viaje.yaPaso) {
    grande = 'Ya pasó';
    detalle = `Pasó por ${viaje.parada.nombre}.`;
    color = 'text.secondary';
  } else if (viaje.minutos != null && viaje.minutos <= 1) {
    grande = 'Llegando';
    detalle = `Está por llegar a ${viaje.parada.nombre}.`;
    color = VERDE;
  } else if (viaje.minutos != null) {
    grande = `${viaje.minutos} min`;
    detalle = `para llegar a ${viaje.parada.nombre}`;
  } else {
    grande = 'En camino';
    detalle = viaje.recorrido;
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Typography variant="overline" color="text.secondary" lineHeight={1.2}>
        {viaje.recorrido}
      </Typography>
      <Typography
        sx={{ fontSize: { xs: 34, md: 40 }, fontWeight: 800, lineHeight: 1.1, color, mt: 0.5 }}
      >
        {grande}
      </Typography>
      <Typography color="text.secondary">{detalle}</Typography>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mt: 1.5 }}
        flexWrap="wrap"
        useFlexGap
      >
        <Chip
          size="small"
          icon={<PlaceIcon />}
          label={`Tu parada: ${viaje.parada.nombre}`}
          sx={{ bgcolor: '#fff7d1' }}
        />
        <Chip size="small" icon={<AccessTimeIcon />} label={viaje.horario} variant="outlined" />
        {viaje.posicion && (
          <Button size="small" startIcon={<MyLocationIcon />} onClick={() => onVer(viaje.posicion)}>
            Ver el bus
          </Button>
        )}
      </Stack>
    </Paper>
  );
};

const PanelPersonal = ({ datos, tipo, onVer }) => (
  <Stack spacing={2}>
    {datos.pasajeros.map((p) => (
      <Box key={p.nombre}>
        {datos.pasajeros.length > 1 && (
          <Typography fontWeight={700} sx={{ mb: 1 }}>
            {p.nombre}
          </Typography>
        )}
        {p.viajes.length === 0 ? (
          <Alert severity="info">Hoy no tiene viajes programados.</Alert>
        ) : (
          <Stack spacing={1.5}>
            {p.viajes.map((v) => (
              <EstadoViaje
                key={`${v.recorrido}-${v.horario}`}
                viaje={v}
                tipo={tipo}
                onVer={onVer}
              />
            ))}
          </Stack>
        )}
      </Box>
    ))}
  </Stack>
);

const PanelGrupo = ({ datos, onVer, elegido, onElegir }) => (
  <Stack spacing={1.5}>
    {datos.buses.length === 0 && (
      <Alert severity="info">Hoy no hay buses programados para este grupo.</Alert>
    )}
    {datos.buses.map((b, i) => {
      const clave = `g${i}`;
      const estado = b.terminado
        ? 'Terminó'
        : b.porSalir
          ? 'Por salir'
          : b.enRuta
            ? b.sinSenal
              ? 'Sin señal'
              : 'En ruta'
            : 'Fuera de horario';
      const siguientes = b.paradas
        .filter((p) => p.minutos != null)
        .sort((x, y) => x.minutos - y.minutos)
        .slice(0, 3);
      return (
        <Paper
          key={`${b.recorrido}-${b.horario}`}
          variant="outlined"
          onClick={() => {
            onElegir(clave);
            if (b.posicion) onVer(b.posicion, false);
          }}
          sx={{
            p: 1.5,
            borderRadius: 3,
            cursor: 'pointer',
            // El elegido se marca acá también: el mapa y la lista dicen lo mismo.
            borderColor: elegido === clave ? OSCURO : undefined,
            borderWidth: elegido === clave ? 2 : 1,
            opacity: elegido && elegido !== clave ? 0.55 : 1,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <DirectionsBusIcon sx={{ color: OSCURO }} />
            <Typography fontWeight={700} sx={{ flexGrow: 1 }}>
              {b.recorrido}
            </Typography>
            <Chip
              size="small"
              label={estado}
              sx={{
                fontWeight: 600,
                bgcolor: estado === 'En ruta' ? VERDE : 'action.selected',
                color: estado === 'En ruta' ? '#fff' : OSCURO,
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Horario {b.horario}
            {b.proxima && ` · próxima parada: ${b.proxima}`}
          </Typography>
          {siguientes.map((p) => (
            <Stack key={p.nombre} direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
              <PlaceIcon fontSize="small" color="action" />
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                {p.nombre}
              </Typography>
              <Minutos minutos={p.minutos} />
            </Stack>
          ))}
          {b.posicion && (
            <Button
              size="small"
              startIcon={<MyLocationIcon />}
              sx={{ mt: 0.5 }}
              onClick={(ev) => {
                ev.stopPropagation();
                onElegir(clave);
                onVer(b.posicion, false);
              }}
            >
              Ver en el mapa
            </Button>
          )}
        </Paper>
      );
    })}
  </Stack>
);

const PanelRecorrido = ({ datos, onVer, elegido, onElegir }) => (
  <Stack spacing={2}>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Chip
        icon={
          <DirectionsBusIcon sx={{ color: `${datos.buses.length ? '#fff' : OSCURO} !important` }} />
        }
        label={datos.buses.length === 1 ? '1 bus en ruta' : `${datos.buses.length} buses en ruta`}
        sx={{
          fontWeight: 700,
          bgcolor: datos.buses.length ? VERDE : 'action.selected',
          color: datos.buses.length ? '#fff' : OSCURO,
        }}
      />
      <Chip label={`${datos.paradas.length} paradas · ${datos.km} km`} variant="outlined" />
      {datos.circular && <Chip label="Circuito" variant="outlined" />}
    </Stack>

    {datos.buses.length === 0 && (
      <Alert severity="info">
        No hay buses en ruta ahora.
        {datos.proximasSalidas.length > 0 &&
          ` Salidas de hoy: ${datos.proximasSalidas.join(', ')}.`}
      </Alert>
    )}

    {/* De dónde sale y dónde termina, en una línea: es lo que decide si alguien puede esperar el
        bus de vuelta en el mismo lugar. */}
    <Typography variant="body2" color="text.secondary">
      {datos.circular ? (
        <>
          Sale de <strong>{datos.paradas[0]?.nombre}</strong> y vuelve al mismo punto.
        </>
      ) : (
        <>
          Sale de <strong>{datos.paradas[0]?.nombre}</strong> y termina en{' '}
          <strong>{datos.paradas.at(-1)?.nombre}</strong>.
        </>
      )}
      {datos.buses.length > 1 &&
        ` Los ${datos.buses.length} buses hacen este mismo recorrido: tocá uno para ver por dónde va y lo que le falta.`}
    </Typography>

    {datos.buses.map((b) => (
      <ButtonBase
        key={b.numero}
        onClick={() => {
          onElegir(`b${b.numero}`);
          if (b.posicion) onVer(b.posicion, false);
        }}
        sx={{ borderRadius: 3, textAlign: 'left', display: 'block', width: '100%' }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: 1.25,
            borderRadius: 3,
            width: '100%',
            borderColor: elegido === `b${b.numero}` ? OSCURO : undefined,
            borderWidth: elegido === `b${b.numero}` ? 2 : 1,
            opacity: elegido && elegido !== `b${b.numero}` ? 0.55 : 1,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                bgcolor: AMARILLO,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${OSCURO}`,
              }}
            >
              <DirectionsBusIcon sx={{ fontSize: 18, color: OSCURO }} />
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography fontWeight={700} lineHeight={1.2}>
                {datos.buses.length > 1 ? `Bus ${b.numero}` : 'El bus'}
                {b.sinSenal
                  ? ' · sin señal'
                  : b.porSalir
                    ? ' · por salir'
                    : b.detenido
                      ? ' · detenido'
                      : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {b.proxima ? `Va hacia ${b.proxima}` : `Horario ${b.horario}`}
              </Typography>
            </Box>
            <MyLocationIcon fontSize="small" color="action" />
          </Stack>
        </Paper>
      </ButtonBase>
    ))}

    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Paradas y próximo bus
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <Box
          sx={{
            position: 'absolute',
            left: 13,
            top: 14,
            bottom: 14,
            width: 4,
            bgcolor: AZUL_LINEA,
            borderRadius: 2,
            opacity: 0.35,
          }}
        />
        {datos.paradas.map((p, i) => (
          <ButtonBase
            key={`${p.orden}-${p.nombre}`}
            onClick={() => onVer(p)}
            sx={{ width: '100%', borderRadius: 2, textAlign: 'left' }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ py: 0.9, width: '100%', position: 'relative' }}
            >
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: '50%',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  bgcolor: i === 0 ? OSCURO : '#fff',
                  color: i === 0 ? '#fff' : AZUL_LINEA,
                  border: `3px solid ${i === 0 ? '#fff' : AZUL_LINEA}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                }}
              >
                {p.orden}
              </Box>
              <Typography sx={{ flexGrow: 1 }} fontWeight={i === 0 ? 700 : 400}>
                {p.nombre}
              </Typography>
              <Minutos minutos={p.minutos} />
            </Stack>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  </Stack>
);

// ── Página ──────────────────────────────────────────────────────────────────

const SeguirContenido = () => {
  const { codigo } = useParams();
  const escritorio = useMediaQuery(tema.breakpoints.up('md'));
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const marcadores = useRef({ paradas: [], buses: new Map() });
  const encuadrado = useRef(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [capa, setCapa] = useState('mapa');
  const [googleKey, setGoogleKey] = useState(null);
  const [listo, setListo] = useState(false);
  const [segundos, setSegundos] = useState(0);
  // Qué bus está elegido. Solo cambia cómo se ve el mapa: no filtra ni esconde nada.
  const [elegido, setElegido] = useState(null);

  const tipo = TIPO[datos?.operacion] ?? TIPO.linea;

  // Clave de Google del servidor, si la hay (sin ella, los mosaicos públicos de Google).
  useEffect(() => {
    fetch('/api/server', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s?.attributes?.googleKey && setGoogleKey(s.attributes.googleKey))
      .catch(() => {});
  }, []);

  // El mapa, una vez.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: contenedor.current,
      style: estiloGoogle('mapa', null),
      center: [-87.2068, 14.0723],
      zoom: 12,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => setListo(true));
    // Tocar el mapa fuera de un bus vuelve a mostrarlos todos por igual.
    m.on('click', () => setElegido(null));
    // El contenedor toma su alto final después de montar (grilla, hoja inferior): sin esto el mapa
    // queda con el tamaño del primer instante y deja una franja vacía.
    const observador = new ResizeObserver(() => m.resize());
    observador.observe(contenedor.current);
    mapa.current = m;
    return () => {
      observador.disconnect();
      m.remove();
    };
  }, []);

  // Cambiar Mapa / Satélite: el estilo base se reemplaza y las capas propias se vuelven a dibujar.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    setListo(false);
    m.setStyle(estiloGoogle(capa, googleKey));
    m.once('idle', () => setListo(true));
  }, [capa, googleKey]);

  // Los datos, cada 15 s (o lo que diga el servidor).
  useEffect(() => {
    let vivo = true;
    let temporizador = null;
    const cargar = async () => {
      try {
        const r = await seguirPublico(codigo);
        if (!vivo) return;
        setDatos(r);
        setError('');
        setSegundos(0);
        temporizador = setTimeout(cargar, (r.refrescarSegundos ?? 15) * 1000);
      } catch (e) {
        if (!vivo) return;
        setError(e.message);
        if (e.estado !== 404) temporizador = setTimeout(cargar, 30_000);
      }
    };
    cargar();
    return () => {
      vivo = false;
      clearTimeout(temporizador);
    };
  }, [codigo]);

  // «Actualizado hace N s».
  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const capas = useMemo(() => capasDe(datos), [datos]);

  // El tramo que le falta al bus elegido, sobre su propio recorrido.
  const tramo = useMemo(() => {
    if (!elegido) return [];
    const bus = capas.buses.find((b) => b.clave === elegido);
    if (!bus) return [];
    const suya =
      capas.lineas.find((l) => l.clave === bus.clave) ??
      (capas.lineas.length === 1 ? capas.lineas[0] : null);
    return loQueLeFalta(suya?.coordenadas, bus);
  }, [elegido, capas]);

  // Trazo con sentido de marcha.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (!m.hasImage('flecha')) m.addImage('flecha', imagenFlecha(), { pixelRatio: 2 });
    const geo = {
      type: 'FeatureCollection',
      features: capas.lineas.map((l) => ({
        type: 'Feature',
        properties: { clave: l.clave },
        geometry: {
          type: 'LineString',
          coordinates: l.coordenadas.map(([lat, lon]) => [lon, lat]),
        },
      })),
    };
    if (m.getSource('recorrido')) {
      m.getSource('recorrido').setData(geo);
    } else {
      // `tolerance: 0`: sin esto maplibre simplifica la línea al hacer sus teselas y a la vista
      // de toda la ciudad se come los tramos cortos —una entrada a un centro comercial, un lazo
      // para dar la vuelta—. El bus sí va por ahí, así que aparecía «fuera de la carretera».
      m.addSource('recorrido', { type: 'geojson', tolerance: 0, data: geo });
      m.addLayer({
        id: 'recorrido-borde',
        type: 'line',
        source: 'recorrido',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9 },
      });
      m.addLayer({
        id: 'recorrido-linea',
        type: 'line',
        source: 'recorrido',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': AZUL_LINEA, 'line-width': 5.5 },
      });
      m.addLayer({
        id: 'recorrido-sentido',
        type: 'symbol',
        source: 'recorrido',
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 90,
          'icon-image': 'flecha',
          'icon-size': 0.9,
          'icon-allow-overlap': true,
        },
      });
    }
  }, [capas, listo]);

  // Con un bus elegido: su tramo pendiente en amarillo —el mismo color del bus— encima del
  // recorrido, y todo lo demás tenue. Sin nadie elegido, el mapa queda como estaba.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || !m.getLayer('recorrido-linea')) return;
    // Con varios recorridos se apagan los ajenos; con uno solo se apaga por igual, porque lo que
    // resalta es el tramo del bus, no el recorrido.
    const uno = capas.lineas.length > 1 ? elegido : null;
    const hayElegido = Boolean(elegido) && tramo.length > 1;
    const tenue = (activo, apagado) =>
      hayElegido && !uno ? apagado : segunElegido(uno, activo, apagado);
    m.setPaintProperty('recorrido-linea', 'line-opacity', tenue(1, 0.3));
    m.setPaintProperty('recorrido-linea', 'line-width', tenue(6.5, 4));
    m.setPaintProperty('recorrido-borde', 'line-opacity', tenue(1, 0.3));
    m.setPaintProperty('recorrido-sentido', 'icon-opacity', tenue(1, 0.15));

    const geo = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: tramo.map(([lat, lon]) => [lon, lat]) },
    };
    if (m.getSource('tramo')) {
      m.getSource('tramo').setData(geo);
    } else {
      m.addSource('tramo', { type: 'geojson', tolerance: 0, data: geo });
      m.addLayer({
        id: 'tramo-borde',
        type: 'line',
        source: 'tramo',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': OSCURO, 'line-width': 9 },
      });
      m.addLayer({
        id: 'tramo-linea',
        type: 'line',
        source: 'tramo',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': AMARILLO, 'line-width': 5.5 },
      });
    }
  }, [elegido, capas, tramo, listo]);

  // El bus elegido, entero y adelante; los demás, tenues.
  //
  // La opacidad va por `setOpacity` y no por el estilo del elemento: maplibre la reescribe en cada
  // cuadro (tiene su propia opacidad para los marcadores tapados), así que ponerla a mano se
  // borraba sola y el resaltado no se veía.
  useEffect(() => {
    marcadores.current.buses.forEach((marcador, clave) => {
      marcador.setOpacity(elegido && elegido !== clave ? '0.4' : '1');
      marcador.getElement().style.zIndex = elegido === clave ? '3' : '1';
    });
  }, [elegido, capas]);

  // Paradas y buses (los buses se mueven suave de una posición a la siguiente).
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    marcadores.current.paradas.forEach((x) => x.remove());
    marcadores.current.paradas = capas.paradas.map((p) =>
      new maplibregl.Marker({ element: elementoParada(p) })
        .setLngLat([p.lon, p.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 16, closeButton: false }).setText(
            p.mia
              ? `Tu parada: ${p.nombre}`
              : `${p.orden}. ${p.nombre}${p.etiqueta ? ` · ${p.etiqueta}` : ''}`,
          ),
        )
        .addTo(m),
    );

    const vistos = new Set();
    capas.buses.forEach((b) => {
      vistos.add(b.clave);
      let marcador = marcadores.current.buses.get(b.clave);
      if (!marcador) {
        const elemento = elementoBus(b.etiqueta);
        elemento.style.cursor = 'pointer';
        // Tocarlo de nuevo lo suelta: es un resaltado, no un filtro del que haya que salir.
        elemento.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setElegido((actual) => (actual === b.clave ? null : b.clave));
        });
        // `bottom`: la punta del alfiler queda sobre la coordenada, no el centro del ícono.
        marcador = new maplibregl.Marker({ element: elemento, anchor: 'bottom' })
          .setLngLat([b.lon, b.lat])
          .addTo(m);
        marcadores.current.buses.set(b.clave, marcador);
      } else {
        const desde = marcador.getLngLat();
        const inicio = performance.now();
        const paso = (ahora) => {
          const f = Math.min(1, (ahora - inicio) / 1200);
          marcador.setLngLat([
            desde.lng + (b.lon - desde.lng) * f,
            desde.lat + (b.lat - desde.lat) * f,
          ]);
          if (f < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      }
      const flecha = marcador.getElement().querySelector('[data-rumbo]');
      if (flecha) {
        flecha.style.display = b.rumbo == null ? 'none' : 'block';
        if (b.rumbo != null) flecha.style.transform = `rotate(${b.rumbo}deg)`;
      }
    });
    marcadores.current.buses.forEach((marcador, clave) => {
      if (!vistos.has(clave)) {
        marcador.remove();
        marcadores.current.buses.delete(clave);
      }
    });

    // Encuadre una sola vez: después manda quien mira el mapa.
    const puntos = [
      ...capas.lineas.flatMap((l) => l.coordenadas).map(([lat, lon]) => [lon, lat]),
      ...capas.paradas.map((p) => [p.lon, p.lat]),
      ...capas.buses.map((b) => [b.lon, b.lat]),
    ];
    if (puntos.length > 0 && !encuadrado.current) {
      const caja = puntos.reduce(
        (c, p) => c.extend(p),
        new maplibregl.LngLatBounds(puntos[0], puntos[0]),
      );
      m.fitBounds(caja, { padding: escritorio ? 60 : 36, maxZoom: 15, duration: 0 });
      encuadrado.current = true;
    }
  }, [capas, escritorio]);

  // `acercar` en false centra sin cambiar el zoom: al elegir un bus se quiere ver dónde va SIN
  // perder de vista el recorrido completo. Para una parada sí se acerca: es un punto.
  const ver = (p, acercar = true) =>
    mapa.current?.flyTo({
      center: [p.lon, p.lat],
      zoom: acercar ? 16 : mapa.current.getZoom(),
      duration: 700,
    });

  const encabezado = (
    <Box sx={{ bgcolor: OSCURO, color: '#fff', px: 2, py: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box component="img" src="/logo.svg" alt="TelConHN" sx={{ height: 18, width: 'auto' }} />
        <Box sx={{ flexGrow: 1 }} />
        {datos && (
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#22c55e',
                animation: 'pulso 1.6s infinite',
                '@keyframes pulso': {
                  '0%': { boxShadow: '0 0 0 0 rgba(34,197,94,.7)' },
                  '100%': { boxShadow: '0 0 0 8px rgba(34,197,94,0)' },
                },
              }}
            />
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              En vivo · hace {segundos} s
            </Typography>
          </Stack>
        )}
      </Stack>
      {datos && (
        <Box sx={{ mt: 1.25 }}>
          <Chip
            size="small"
            label={tipo.nombre}
            sx={{ bgcolor: AMARILLO, color: OSCURO, fontWeight: 700, height: 22 }}
          />
          <Typography variant="h6" fontWeight={800} lineHeight={1.2} sx={{ mt: 0.75 }}>
            {datos.titulo}
          </Typography>
          {datos.variante && (
            <Typography variant="body2" sx={{ opacity: 0.75 }}>
              {datos.variante}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );

  const panel = (
    <Box sx={{ p: 2 }}>
      {!datos && !error && <LinearProgress color="secondary" />}
      {error && (
        <Alert severity={error.includes('no existe') ? 'info' : 'warning'}>
          {error}
          {error.includes('no existe') &&
            ' Pedile un enlace nuevo a quien administra el transporte.'}
        </Alert>
      )}
      {datos?.clase === 'personal' && <PanelPersonal datos={datos} tipo={tipo} onVer={ver} />}
      {datos?.clase === 'grupo' && (
        <PanelGrupo
          datos={datos}
          onVer={ver}
          elegido={elegido}
          onElegir={(clave) => setElegido((actual) => (actual === clave ? null : clave))}
        />
      )}
      {datos?.clase === 'recorrido' && (
        <PanelRecorrido
          datos={datos}
          onVer={ver}
          elegido={elegido}
          onElegir={(clave) => setElegido((actual) => (actual === clave ? null : clave))}
        />
      )}
      {datos && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          textAlign="center"
          sx={{ mt: 3 }}
        >
          Hora de Honduras · actualizado a las {hora(datos.actualizado)} · este enlace vence el{' '}
          {fechaCorta(datos.venceEn)}
        </Typography>
      )}
    </Box>
  );

  const selectorCapa = (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={capa}
      onChange={(_, v) => v && setCapa(v)}
      sx={{
        position: 'absolute',
        left: 12,
        top: 12,
        bgcolor: '#fff',
        boxShadow: 2,
        borderRadius: 2,
        zIndex: 2,
      }}
    >
      <ToggleButton value="mapa" sx={{ px: 1.5, fontWeight: 600 }}>
        Mapa
      </ToggleButton>
      <ToggleButton value="satelite" sx={{ px: 1.5, fontWeight: 600 }}>
        Satélite
      </ToggleButton>
    </ToggleButtonGroup>
  );

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'grid',
        bgcolor: 'background.default',
        // minmax(0, …): sin esto, en el teléfono el contenido ancho empuja la columna y las
        // tarjetas se salen de la pantalla.
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '420px minmax(0, 1fr)' },
        gridTemplateRows: { xs: 'auto minmax(40vh, 1fr) auto', md: '1fr' },
      }}
    >
      {escritorio ? (
        <>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            {encabezado}
            <Box sx={{ overflow: 'auto', flexGrow: 1 }}>{panel}</Box>
          </Box>
          <Box sx={{ position: 'relative', minHeight: 0 }}>
            <Box ref={contenedor} sx={{ position: 'absolute', inset: 0 }} />
            {selectorCapa}
          </Box>
        </>
      ) : (
        <>
          {encabezado}
          <Box sx={{ position: 'relative', minHeight: 0 }}>
            <Box ref={contenedor} sx={{ position: 'absolute', inset: 0 }} />
            {selectorCapa}
          </Box>
          <Paper
            square
            elevation={8}
            sx={{
              maxHeight: '48vh',
              overflow: 'auto',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              mt: -2,
              position: 'relative',
              zIndex: 3,
            }}
          >
            <Box
              sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }}
            />
            {panel}
          </Paper>
        </>
      )}
    </Box>
  );
};

/// Tema claro propio: la página pública no hereda el modo oscuro de la aplicación.
const SeguirPage = () => (
  <ThemeProvider theme={tema}>
    <CssBaseline />
    <SeguirContenido key={useMediaQuery(tema.breakpoints.up('md')) ? 'pc' : 'tel'} />
  </ThemeProvider>
);

export default SeguirPage;
