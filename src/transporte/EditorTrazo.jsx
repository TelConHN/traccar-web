// Dibujar un recorrido tocando el mapa: paradas y puntos guía, con el trazo por calle en vivo.
//
// Se usa al crear un recorrido («Dibujar en el mapa»), al corregir el trazo de un viaje grabado
// antes de guardarlo y al corregir el de un recorrido ya guardado. Piezas:
//   · usePuntos: la lista de puntos con «Deshacer».
//   · useTrazado: pide el trazo al servidor cada vez que cambian los puntos (tras una pausa corta).
//   · PuntosEnMapa: marcadores arrastrables y el toque sobre el mapa.
//   · PanelTrazo: el modo del toque, la lista y los atajos.
//
// Un punto guía no es una parada: solo obliga al trazo a pasar por esa calle. Tocar cerca de la
// línea mete el punto entre los dos que corresponde, no al final: así se corrige un pedazo sin
// rehacer todo.
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Alert,
  Box,
  Button,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaceIcon from '@mui/icons-material/Place';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LoopIcon from '@mui/icons-material/Loop';
import UndoIcon from '@mui/icons-material/Undo';
import { map } from '../map/core/MapView';
import transporteApi from './api';
import { prepararLinea, metroSobre, muestrear } from './geo';

/// Tope del servidor (`POST /lineas/trazar`).
export const MAX_PUNTOS = 50;
/// Un toque a menos de esto (en pantalla) de la línea se inserta entre dos puntos.
const TOQUE_SOBRE_LINEA_PX = 16;
const OSCURO = '#18181b';
const AMARILLO = '#FFC800';

let secuencia = 0;
export const nuevoPunto = ({ latitud, longitud, guia = false, nombre = '' }) => {
  secuencia += 1;
  return { id: secuencia, latitud, longitud, guia, nombre };
};

/// Puntos guía repartidos sobre un trazo existente, para corregirlo en vez de dibujarlo de cero.
export const puntosDesdeTrazo = (coordenadas) => {
  if (!coordenadas || coordenadas.length < 2) return [];
  const { metros } = prepararLinea(coordenadas);
  const cada = Math.max(300, Math.ceil(metros / (MAX_PUNTOS - 5)));
  return muestrear(coordenadas, cada).map(([latitud, longitud]) =>
    nuevoPunto({ latitud, longitud, guia: true }),
  );
};

export const usePuntos = (inicial = []) => {
  const [puntos, setPuntos] = useState(inicial);
  const [historial, setHistorial] = useState([]);
  const cambiar = (siguientes) => {
    setHistorial((h) => [...h.slice(-49), puntos]);
    setPuntos(siguientes);
  };
  const deshacer = () => {
    if (historial.length === 0) return;
    setPuntos(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
  };
  const reiniciar = (nuevos) => {
    setHistorial([]);
    setPuntos(nuevos);
  };
  return { puntos, cambiar, deshacer, puedeDeshacer: historial.length > 0, reiniciar };
};

const SIN_TRAZO = { coordenadas: [], metros: 0, ajustados: [], cargando: false, error: '' };

export const useTrazado = (puntos, activo = true) => {
  const [estado, setEstado] = useState(SIN_TRAZO);
  useEffect(() => {
    if (!activo || puntos.length < 2) {
      setEstado(SIN_TRAZO);
      return undefined;
    }
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: '' }));
    const espera = setTimeout(async () => {
      try {
        const r = await transporteApi.trazar(
          puntos.map((p) => ({ latitud: p.latitud, longitud: p.longitud, guia: Boolean(p.guia) })),
        );
        if (vigente) {
          setEstado({
            coordenadas: r.coordenadas,
            metros: r.metros,
            ajustados: r.puntos ?? [],
            cargando: false,
            error: '',
          });
        }
      } catch (e) {
        if (vigente) setEstado((s) => ({ ...s, cargando: false, error: e.message }));
      }
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [puntos, activo]);
  return estado;
};

/// En qué posición de la lista va un toque: entre los dos puntos que lo rodean sobre la línea si
/// cayó encima de ella; al final si no.
const indiceParaInsertar = (puntos, trazado, toque, metrosPorPixel) => {
  if (puntos.length < 2 || trazado.coordenadas.length < 2) return puntos.length;
  const preparada = prepararLinea(trazado.coordenadas);
  const sobre = metroSobre(preparada, toque);
  if (sobre.distancia > TOQUE_SOBRE_LINEA_PX * metrosPorPixel) return puntos.length;
  // Los puntos como quedaron enganchados a la calle (si el trazo corresponde a esta lista).
  const base =
    trazado.ajustados.length === puntos.length
      ? trazado.ajustados
      : puntos.map((p) => [p.latitud, p.longitud]);
  let desde = -Infinity;
  const metros = base.map((c) => {
    const { metro } = metroSobre(preparada, c, desde);
    desde = metro - 1;
    return metro;
  });
  const i = metros.findIndex((m) => m > sobre.metro);
  return Math.max(1, Math.min(puntos.length - 1, i === -1 ? puntos.length - 1 : i));
};

const estilo = (el, css) => Object.assign(el.style, css);

export const PuntosEnMapa = ({ puntos, onCambiar, modo, trazado, soloGuias = false }) => {
  const estado = useRef({});
  estado.current = { puntos, onCambiar, modo, trazado, soloGuias };

  useEffect(() => {
    const alTocar = (e) => {
      if (e.originalEvent?.target?.closest?.('.maplibregl-marker')) return;
      const s = estado.current;
      if (s.puntos.length >= MAX_PUNTOS) return;
      const { lat, lng } = e.lngLat;
      const metrosPorPixel =
        (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
      const i = indiceParaInsertar(s.puntos, s.trazado, [lat, lng], metrosPorPixel);
      const guia = s.soloGuias || s.modo === 'guia';
      const nuevo = nuevoPunto({
        latitud: lat,
        longitud: lng,
        guia,
        nombre: guia ? '' : `Parada ${s.puntos.filter((p) => !p.guia).length + 1}`,
      });
      s.onCambiar([...s.puntos.slice(0, i), nuevo, ...s.puntos.slice(i)]);
    };
    map.on('click', alTocar);
    return () => map.off('click', alTocar);
  }, []);

  useEffect(() => {
    let numero = 0;
    const marcadores = puntos.map((p) => {
      const el = document.createElement('div');
      if (p.guia) {
        estilo(el, {
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#fff',
          border: `3px solid ${OSCURO}`,
          boxShadow: '0 1px 4px rgba(0,0,0,.45)',
          cursor: 'grab',
          boxSizing: 'border-box',
        });
        el.title = 'Punto guía · arrastralo para moverlo, tocalo para quitarlo';
      } else {
        numero += 1;
        estilo(el, {
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: AMARILLO,
          color: OSCURO,
          border: `2px solid ${OSCURO}`,
          boxShadow: '0 1px 4px rgba(0,0,0,.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: '700 13px system-ui, sans-serif',
          cursor: 'grab',
          boxSizing: 'border-box',
        });
        el.textContent = String(numero);
        el.title = `${p.nombre || 'Parada'} · arrastrala para moverla`;
      }
      const marcador = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([p.longitud, p.latitud])
        .addTo(map);
      let arrastrado = false;
      marcador.on('dragstart', () => {
        arrastrado = true;
      });
      marcador.on('dragend', () => {
        const { lat, lng } = marcador.getLngLat();
        const s = estado.current;
        s.onCambiar(
          s.puntos.map((x) => (x.id === p.id ? { ...x, latitud: lat, longitud: lng } : x)),
        );
      });
      // Tocar un punto guía lo quita (sobre el mapa es donde se ve cuál sobra). Una parada no:
      // tiene nombre y se quita desde la lista, a propósito.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (arrastrado) {
          arrastrado = false;
          return;
        }
        if (!p.guia) return;
        const s = estado.current;
        s.onCambiar(s.puntos.filter((x) => x.id !== p.id));
      });
      return marcador;
    });
    return () => marcadores.forEach((m) => m.remove());
  }, [puntos]);

  return null;
};

const Numero = ({ children, guia }) => (
  <Box
    sx={{
      width: guia ? 14 : 24,
      height: guia ? 14 : 24,
      mx: guia ? '5px' : 0,
      flexShrink: 0,
      borderRadius: '50%',
      bgcolor: guia ? '#fff' : AMARILLO,
      color: OSCURO,
      border: `${guia ? 3 : 2}px solid ${OSCURO}`,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700,
    }}
  >
    {children}
  </Box>
);

export const PanelTrazo = ({
  puntos,
  onCambiar,
  onDeshacer,
  puedeDeshacer,
  modo,
  onModo,
  trazado,
  soloGuias = false,
}) => {
  const paradas = puntos.filter((p) => !p.guia).length;
  const guias = puntos.length - paradas;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const cerrado =
    puntos.length > 2 &&
    Math.hypot(
      (primero.latitud - ultimo.latitud) * 110540,
      (primero.longitud - ultimo.longitud) * 107900,
    ) < 40;

  const cambiarTipo = (id) =>
    onCambiar(
      puntos.map((p) =>
        p.id === id
          ? { ...p, guia: !p.guia, nombre: p.guia ? p.nombre || `Parada ${paradas + 1}` : p.nombre }
          : p,
      ),
    );

  // Filas: cada parada sola; los puntos guía seguidos, agrupados en una fila.
  const filas = [];
  let numero = 0;
  puntos.forEach((p) => {
    if (p.guia) {
      const anterior = filas[filas.length - 1];
      if (anterior?.guias) anterior.guias.push(p);
      else filas.push({ clave: `g${p.id}`, guias: [p] });
    } else {
      numero += 1;
      filas.push({ clave: `p${p.id}`, parada: p, numero });
    }
  });

  return (
    <Stack spacing={1.5}>
      {!soloGuias && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Tocar el mapa agrega
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={modo}
            onChange={(_, v) => v && onModo(v)}
          >
            <ToggleButton value="parada">
              <PlaceIcon fontSize="small" sx={{ mr: 0.5 }} />
              Parada
            </ToggleButton>
            <ToggleButton value="guia">
              <AltRouteIcon fontSize="small" sx={{ mr: 0.5 }} />
              Punto guía
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Typography variant="body2" color="text.secondary">
        {soloGuias
          ? 'Arrastrá los puntos a la calle correcta y tocá los que sobran para quitarlos. Tocá sobre la línea para agregar uno entre dos.'
          : 'Tocá el mapa en el orden del recorrido. Un punto guía no es parada: solo obliga a pasar por esa calle. Tocá sobre la línea para meter un punto entre dos, y arrastrá cualquiera para moverlo.'}
      </Typography>

      {puntos.length >= 2 && (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {trazado.metros ? `${(trazado.metros / 1000).toFixed(1)} km` : 'Trazando…'}
            {!soloGuias && ` · ${paradas} ${paradas === 1 ? 'parada' : 'paradas'}`}
            {` · ${guias} ${guias === 1 ? 'punto guía' : 'puntos guía'}`}
          </Typography>
          <LinearProgress sx={{ mt: 0.5, visibility: trazado.cargando ? 'visible' : 'hidden' }} />
        </Box>
      )}
      {trazado.error && <Alert severity="error">{trazado.error}</Alert>}
      {puntos.length >= MAX_PUNTOS && (
        <Alert severity="warning">
          Llegaste al máximo de {MAX_PUNTOS} puntos. Quitá puntos guía que no hagan falta: en una
          calle recta alcanza con uno.
        </Alert>
      )}

      <List dense disablePadding>
        {filas.map((f) =>
          f.parada ? (
            <ListItem
              key={f.clave}
              disableGutters
              sx={{ gap: 1, pr: soloGuias ? 5 : 10 }}
              secondaryAction={
                <Stack direction="row">
                  <Tooltip title="Convertir en punto guía">
                    <IconButton size="small" onClick={() => cambiarTipo(f.parada.id)}>
                      <SwapHorizIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Quitar">
                    <IconButton
                      size="small"
                      onClick={() => onCambiar(puntos.filter((x) => x.id !== f.parada.id))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              }
            >
              <Numero>{f.numero}</Numero>
              <TextField
                size="small"
                fullWidth
                value={f.parada.nombre}
                placeholder="Nombre de la parada"
                onChange={(e) =>
                  onCambiar(
                    puntos.map((x) =>
                      x.id === f.parada.id ? { ...x, nombre: e.target.value } : x,
                    ),
                  )
                }
              />
            </ListItem>
          ) : (
            <ListItem
              key={f.clave}
              disableGutters
              sx={{ gap: 1, pr: 5, minHeight: 36 }}
              secondaryAction={
                <Tooltip title={f.guias.length === 1 ? 'Quitar' : 'Quitar estos puntos guía'}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      const quitar = new Set(f.guias.map((g) => g.id));
                      onCambiar(puntos.filter((x) => !quitar.has(x.id)));
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            >
              <Numero guia />
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                {f.guias.length === 1 ? 'Punto guía' : `${f.guias.length} puntos guía`}
              </Typography>
              {!soloGuias && f.guias.length === 1 && (
                <Tooltip title="Convertir en parada">
                  <IconButton size="small" onClick={() => cambiarTipo(f.guias[0].id)}>
                    <SwapHorizIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </ListItem>
          ),
        )}
      </List>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button
          size="small"
          startIcon={<UndoIcon />}
          disabled={!puedeDeshacer}
          onClick={onDeshacer}
        >
          Deshacer
        </Button>
        {puntos.length >= 2 && !cerrado && puntos.length < MAX_PUNTOS && (
          <Button
            size="small"
            startIcon={<LoopIcon />}
            onClick={() =>
              onCambiar([
                ...puntos,
                nuevoPunto({ latitud: primero.latitud, longitud: primero.longitud, guia: true }),
              ])
            }
          >
            Volver al inicio
          </Button>
        )}
        {puntos.length > 0 && (
          <Button size="small" color="inherit" onClick={() => onCambiar([])}>
            Borrar todo
          </Button>
        )}
      </Stack>
    </Stack>
  );
};
