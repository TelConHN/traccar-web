// Grabar un recorrido: tres pasos, sin dibujar nada (TRANSPORTE.md sección 3).
//
//   1. Elegir el viaje — bus y día; se ofrecen los viajes ya cortados («6:02 → 7:08 · 18,4 km»).
//      Alternativas: dibujarlo en el mapa con paradas y puntos guía (EditorTrazo), o importar un
//      KML/GPX de otro sistema.
//   2. Revisar el recorrido — el trazo ajustado a la calle. Si el ajuste salió partido o con
//      poca confianza se muestra también el trazo crudo, punteado, y se dice. Si alguna calle
//      está mal se corrige ahí mismo con puntos guía, sin volver a empezar.
//   3. Confirmar paradas — el sistema propone dónde se detuvo el bus; se aceptan, renombran o
//      borran, y tocando la línea se agrega otra.
//
// Nada se guarda hasta el último botón: la persona ve el recorrido y las paradas antes de que
// exista la línea. Misma disposición que el planificador de Rutas: panel a la izquierda, mapa a
// la derecha; en el teléfono el mapa arriba.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Radio,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import EditRoadIcon from '@mui/icons-material/EditRoad';
import GestureIcon from '@mui/icons-material/Gesture';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MapView, { map } from '../map/core/MapView';
import MapCamera from '../map/MapCamera';
import MapScale from '../map/MapScale';
import LineaEnMapa from './LineaEnMapa';
import transporteApi from './api';
import { PanelTrazo, PuntosEnMapa, puntosDesdeTrazo, usePuntos, useTrazado } from './EditorTrazo';

const useStyles = makeStyles()((theme) => ({
  contenedor: {
    display: 'grid',
    gridTemplateColumns: 'minmax(340px, 420px) 1fr',
    flexGrow: 1,
    minHeight: 0,
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: '1fr',
      gridTemplateRows: 'minmax(220px, 38vh) 1fr',
    },
  },
  panel: {
    minHeight: 0,
    overflow: 'auto',
    padding: theme.spacing(2),
    borderRight: `1px solid ${theme.palette.divider}`,
    [theme.breakpoints.down('md')]: { borderRight: 'none', order: 2 },
  },
  mapa: {
    position: 'relative',
    minHeight: 0,
    [theme.breakpoints.down('md')]: { order: 1 },
  },
}));

const PASOS = ['Elegir el viaje', 'Revisar el recorrido', 'Confirmar paradas'];

const ayer = () => {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA');
};
const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
const km = (m) => `${(m / 1000).toFixed(1)} km`;

const NuevaLinea = ({ vehiculos, operacion }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();

  const [paso, setPaso] = useState(0);
  const [metodo, setMetodo] = useState('viaje');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  // Paso 1 · viaje
  const [deviceId, setDeviceId] = useState(vehiculos[0]?.id ?? '');
  const [fecha, setFecha] = useState(ayer());
  const [viajes, setViajes] = useState(null);
  const [viajeElegido, setViajeElegido] = useState(null);
  const [cortarIdaVuelta, setCortarIdaVuelta] = useState(false);
  // Paso 1 · dibujar en el mapa (y paso 2 · corregir un trazo grabado o importado)
  const dibujo = usePuntos();
  const [modoToque, setModoToque] = useState('parada');
  const [corrigiendo, setCorrigiendo] = useState(false);
  // Paso 1 · importar
  const [archivoNombre, setArchivoNombre] = useState('');

  // Paso 2 y 3
  const [nombre, setNombre] = useState('');
  const [anchoMetros, setAnchoMetros] = useState(60);
  // [{ nombre, coordenadas, crudo, metros, confianza, partido, inicio, fin, paradas: [] }]
  const [variantes, setVariantes] = useState([]);
  const [varianteActiva, setVarianteActiva] = useState(0);
  const [usarSemana, setUsarSemana] = useState(false);
  const [viajesUsados, setViajesUsados] = useState(null);

  const cargarViajes = async () => {
    if (!deviceId || !fecha) return;
    setError('');
    setViajes(null);
    setViajeElegido(null);
    try {
      setViajes(await transporteApi.viajes(deviceId, fecha));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (metodo === 'viaje') cargarViajes();
  }, [deviceId, fecha, metodo]);

  const dibujando = (paso === 0 && metodo === 'paradas') || corrigiendo;
  const trazado = useTrazado(dibujo.puntos, dibujando);

  // En el paso 3, tocar el mapa agrega una parada sobre la línea. Mientras se dibuja, los toques
  // los maneja PuntosEnMapa. Un solo listener, que lee el estado actual por ref.
  const estadoRef = useRef({});
  estadoRef.current = { paso, varianteActiva };
  useEffect(() => {
    const alTocar = (e) => {
      const s = estadoRef.current;
      const punto = { latitud: e.lngLat.lat, longitud: e.lngLat.lng };
      if (s.paso === 2) {
        setVariantes((vs) =>
          vs.map((v, i) =>
            i === s.varianteActiva
              ? {
                  ...v,
                  paradas: [...v.paradas, { ...punto, nombre: `Parada ${v.paradas.length + 1}` }],
                }
              : v,
          ),
        );
      }
    };
    map.on('click', alTocar);
    return () => map.off('click', alTocar);
  }, []);

  // ── Paso 1 → 2 ───────────────────────────────────────────────────────────
  const ajustarViaje = async () => {
    const v = viajes[viajeElegido];
    setTrabajando(true);
    setError('');
    try {
      const r = await transporteApi.ajustar({
        deviceId,
        inicio: v.inicio,
        fin: v.fin,
        cortarIdaVuelta,
      });
      setVariantes(r.variantes.map((x) => ({ ...x, paradas: [] })));
      setVarianteActiva(0);
      setPaso(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  // El trazo ya está calculado en vivo: continuar solo lo toma.
  const usarDibujo = () => {
    setVariantes([
      {
        nombre: 'Recorrido',
        coordenadas: trazado.coordenadas,
        metros: trazado.metros,
        confianza: null,
        partido: false,
        origen: 'paradas',
        paradas: dibujo.puntos
          .filter((p) => !p.guia)
          .map(({ latitud, longitud, nombre: n }) => ({ latitud, longitud, nombre: n })),
      },
    ]);
    setVarianteActiva(0);
    setPaso(1);
  };

  // Corregir el trazo de un viaje grabado o importado: se reparte en puntos guía y se editan.
  const empezarCorreccion = () => {
    dibujo.reiniciar(puntosDesdeTrazo(variantes[varianteActiva].coordenadas));
    setCorrigiendo(true);
  };
  const aplicarCorreccion = () => {
    setVariantes((vs) =>
      vs.map((v, i) =>
        i === varianteActiva
          ? {
              ...v,
              coordenadas: trazado.coordenadas,
              metros: trazado.metros,
              confianza: null,
              partido: false,
              corregida: true,
            }
          : v,
      ),
    );
    setCorrigiendo(false);
  };

  const importarArchivo = async (archivo) => {
    if (!archivo) return;
    setTrabajando(true);
    setError('');
    setArchivoNombre(archivo.name);
    try {
      const texto = await archivo.text();
      const r = await transporteApi.importar(texto);
      setVariantes([
        {
          nombre: 'Recorrido',
          coordenadas: r.coordenadas,
          metros: r.metros,
          confianza: null,
          partido: false,
          origen: 'importada',
          paradas: [],
        },
      ]);
      setVarianteActiva(0);
      setPaso(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  // ── Paso 2 → 3 ───────────────────────────────────────────────────────────
  const proponer = async () => {
    setTrabajando(true);
    setError('');
    try {
      if (metodo === 'viaje') {
        const nuevas = [];
        let usados = 1;
        for (const v of variantes) {
          const r = await transporteApi.proponerParadas({
            deviceId,
            inicio: v.inicio,
            fin: v.fin,
            geometria: v.coordenadas,
            anchoMetros,
            usarUltimos7Dias: usarSemana,
          });
          usados = Math.max(usados, r.viajesUsados);
          nuevas.push({
            ...v,
            paradas: r.propuestas.map((p, i) => ({
              latitud: p.latitud,
              longitud: p.longitud,
              nombre: `Parada ${i + 1}`,
              deViajes: p.deViajes,
              totalViajes: p.totalViajes,
              segundos: p.segundos,
              terminal: i === 0 || i === r.propuestas.length - 1,
            })),
          });
        }
        setVariantes(nuevas);
        setViajesUsados(usados);
      }
      setPaso(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  // ── Guardar ──────────────────────────────────────────────────────────────
  const guardar = async () => {
    setTrabajando(true);
    setError('');
    try {
      const linea = await transporteApi.crearLinea({
        nombre: nombre.trim(),
        variantes: variantes.map((v) => ({
          nombre: v.nombre,
          geometria: v.coordenadas,
          anchoMetros,
          origen: v.origen ?? 'viaje',
          confianza: v.confianza ?? null,
          paradas: v.paradas.map((p) => ({
            nombre: p.nombre.trim() || 'Parada',
            latitud: p.latitud,
            longitud: p.longitud,
            terminal: Boolean(p.terminal),
            ...(operacion === 'linea' ? { privada: false } : {}),
          })),
        })),
      });
      navigate(`/transporte/recorridos/${linea.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const cambiarParada = (i, cambios) =>
    setVariantes((vs) =>
      vs.map((v, k) =>
        k === varianteActiva
          ? { ...v, paradas: v.paradas.map((p, j) => (j === i ? { ...p, ...cambios } : p)) }
          : v,
      ),
    );
  const quitarParada = (i) =>
    setVariantes((vs) =>
      vs.map((v, k) =>
        k === varianteActiva ? { ...v, paradas: v.paradas.filter((_, j) => j !== i) } : v,
      ),
    );

  const activa = variantes[varianteActiva];
  const ajusteDudoso =
    activa && (activa.partido || (activa.confianza != null && activa.confianza < 0.8));
  // Memorizado: MapCamera vuelve a encuadrar cada vez que recibe un arreglo nuevo, y sin esto el
  // mapa saltaba con cada tecla o cada toque.
  const dibujandoDeCero = paso === 0 && metodo === 'paradas';
  // Al dibujar de cero, el mapa arranca sobre los buses de la cuenta (no en el mapamundi). Se
  // encuadra una vez: las posiciones cambian cada pocos segundos y no deben mover el mapa.
  const posiciones = useSelector((state) => state.session.positions);
  const hayPosiciones = vehiculos.some((v) => posiciones[v.id]);
  const encuadre = useMemo(() => {
    if (!dibujandoDeCero) {
      return variantes.flatMap((v) => v.coordenadas ?? []).map(([lat, lon]) => [lon, lat]);
    }
    const buses = vehiculos
      .map((v) => posiciones[v.id])
      .filter(Boolean)
      .map((p) => [p.longitude, p.latitude]);
    // Un solo bus: una caja de unos 3 km alrededor, para ver calles y no un punto.
    return buses.length === 1
      ? [
          [buses[0][0] - 0.015, buses[0][1] - 0.015],
          [buses[0][0] + 0.015, buses[0][1] + 0.015],
        ]
      : buses;
  }, [variantes, dibujandoDeCero, hayPosiciones]);

  return (
    <div className={classes.contenedor}>
      <div className={classes.panel}>
        <Typography variant="h6" component="h1" fontWeight={600} sx={{ mb: 1.5 }}>
          Nuevo recorrido
        </Typography>
        <Stepper activeStep={paso} alternativeLabel sx={{ mb: 2 }}>
          {PASOS.map((p) => (
            <Step key={p}>
              <StepLabel>{p}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {trabajando && <LinearProgress sx={{ mb: 1.5 }} />}
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        {paso === 0 && (
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={metodo}
              onChange={(_, v) => v && setMetodo(v)}
            >
              <ToggleButton value="viaje">
                <DirectionsBusIcon fontSize="small" sx={{ mr: 0.5 }} />
                Grabar un viaje
              </ToggleButton>
              <ToggleButton value="paradas">
                <GestureIcon fontSize="small" sx={{ mr: 0.5 }} />
                Dibujar en el mapa
              </ToggleButton>
              <ToggleButton value="importar">
                <UploadFileIcon fontSize="small" sx={{ mr: 0.5 }} />
                Importar
              </ToggleButton>
            </ToggleButtonGroup>

            {metodo === 'viaje' && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Elegí el bus y el día. Te mostramos los viajes que hizo, ya cortados: el recorrido
                  sale de uno de ellos, no hay que dibujar nada.
                </Typography>
                <TextField
                  select
                  label="Bus"
                  size="small"
                  value={deviceId}
                  onChange={(e) => setDeviceId(Number(e.target.value))}
                >
                  {vehiculos.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.nombre}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  type="date"
                  label="Día"
                  size="small"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                {viajes === null && !error && <LinearProgress />}
                {viajes && viajes.length === 0 && (
                  <Alert severity="info">
                    Ese día el bus no hizo ningún viaje de más de 500 m. Probá con otro día.
                  </Alert>
                )}
                {viajes && viajes.length > 0 && (
                  <List dense disablePadding>
                    {viajes.map((v, i) => (
                      <ListItemButton
                        key={v.inicio}
                        selected={viajeElegido === i}
                        onClick={() => setViajeElegido(i)}
                        sx={{ borderRadius: 1 }}
                      >
                        <Radio
                          size="small"
                          checked={viajeElegido === i}
                          tabIndex={-1}
                          sx={{ mr: 0.5 }}
                        />
                        <ListItemText
                          primary={`${hora(v.inicio)} → ${hora(v.fin)} · ${km(v.metros)}`}
                          secondary={`${v.posiciones} posiciones${v.pareceIdaYVuelta ? ' · parece ida y vuelta' : ''}`}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                )}
                {viajeElegido !== null && viajes[viajeElegido]?.pareceIdaYVuelta && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={cortarIdaVuelta}
                        onChange={(e) => setCortarIdaVuelta(e.target.checked)}
                      />
                    }
                    label="Cortar en la terminal: ida y vuelta como dos variantes"
                  />
                )}
                <Button
                  variant="contained"
                  disabled={viajeElegido === null || trabajando}
                  onClick={ajustarViaje}
                >
                  Ajustar a la calle
                </Button>
              </>
            )}

            {metodo === 'paradas' && (
              <>
                <PanelTrazo
                  puntos={dibujo.puntos}
                  onCambiar={dibujo.cambiar}
                  onDeshacer={dibujo.deshacer}
                  puedeDeshacer={dibujo.puedeDeshacer}
                  modo={modoToque}
                  onModo={setModoToque}
                  trazado={trazado}
                />
                <Button
                  variant="contained"
                  disabled={
                    dibujo.puntos.length < 2 || trazado.cargando || trazado.coordenadas.length < 2
                  }
                  onClick={usarDibujo}
                >
                  Continuar
                </Button>
              </>
            )}

            {metodo === 'importar' && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Un archivo KML o GPX exportado de otro sistema (o de Rutas). Se toma la línea más
                  larga que traiga; las paradas se agregan después tocando el mapa.
                </Typography>
                <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                  {archivoNombre || 'Elegir archivo'}
                  <input
                    hidden
                    type="file"
                    accept=".kml,.gpx,.xml"
                    onChange={(e) => importarArchivo(e.target.files?.[0])}
                  />
                </Button>
              </>
            )}
          </Stack>
        )}

        {paso === 1 && activa && corrigiendo && (
          <Stack spacing={2}>
            <Typography variant="subtitle2" fontWeight={700}>
              Corregir el trazo{variantes.length > 1 ? ` · ${activa.nombre}` : ''}
            </Typography>
            {activa.crudo?.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                La línea punteada es lo que grabó el GPS: guíate con ella.
              </Typography>
            )}
            <PanelTrazo
              puntos={dibujo.puntos}
              onCambiar={dibujo.cambiar}
              onDeshacer={dibujo.deshacer}
              puedeDeshacer={dibujo.puedeDeshacer}
              trazado={trazado}
              soloGuias
            />
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setCorrigiendo(false)}>Cancelar</Button>
              <Button
                variant="contained"
                disabled={trazado.cargando || trazado.coordenadas.length < 2}
                onClick={aplicarCorreccion}
              >
                Usar este trazo
              </Button>
            </Stack>
          </Stack>
        )}

        {paso === 1 && activa && !corrigiendo && (
          <Stack spacing={2}>
            {ajusteDudoso ? (
              <Alert severity="warning">
                {activa.partido
                  ? 'El ajuste salió partido: hubo un hueco de señal o una zona con mapa pobre. '
                  : `El ajuste tiene confianza ${Math.round((activa.confianza ?? 0) * 100)}%. `}
                El trazo crudo del GPS se muestra punteado para comparar. Si el recorrido está mal,
                volvé atrás y elegí otro viaje.
              </Alert>
            ) : (
              <Alert severity="success">
                Recorrido de {km(activa.metros)}
                {activa.confianza != null && ` · confianza ${Math.round(activa.confianza * 100)}%`}
                {activa.corregida && ' · corregido a mano'}. Revisá que vaya por las calles
                correctas.
              </Alert>
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditRoadIcon />}
              onClick={metodo === 'paradas' ? () => setPaso(0) : empezarCorreccion}
              sx={{ alignSelf: 'flex-start' }}
            >
              {metodo === 'paradas' ? 'Cambiar puntos del trazo' : 'Corregir una calle del trazo'}
            </Button>
            {variantes.length > 1 && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={varianteActiva}
                onChange={(_, v) => v !== null && setVarianteActiva(v)}
              >
                {variantes.map((v, i) => (
                  <ToggleButton key={v.nombre} value={i}>
                    {v.nombre} · {km(v.metros)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
            <TextField
              label="Nombre del recorrido"
              size="small"
              autoFocus
              placeholder="Ruta 3 · Colonia Kennedy"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <TextField
              select
              label="Ancho de tolerancia para desvíos"
              size="small"
              value={anchoMetros}
              onChange={(e) => setAnchoMetros(Number(e.target.value))}
            >
              <MenuItem value={60}>60 m — ciudad</MenuItem>
              <MenuItem value={100}>100 m — carretera</MenuItem>
              <MenuItem value={150}>150 m — zona sin mapa detallado</MenuItem>
            </TextField>
            {metodo === 'viaje' && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={usarSemana}
                    onChange={(e) => setUsarSemana(e.target.checked)}
                  />
                }
                label="Usar también los viajes de los últimos 7 días para proponer paradas"
              />
            )}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setPaso(0)}>Atrás</Button>
              <Button
                variant="contained"
                disabled={!nombre.trim() || trabajando}
                onClick={proponer}
              >
                {metodo === 'viaje' ? 'Proponer paradas' : 'Confirmar paradas'}
              </Button>
            </Stack>
          </Stack>
        )}

        {paso === 2 && activa && (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {metodo === 'viaje'
                ? `Estas son las paradas donde se detuvo el bus${viajesUsados > 1 ? ` (${viajesUsados} viajes comparados)` : ''}. Renombrá, borrá las que sean semáforos, y tocá la línea para agregar otra.`
                : 'Revisá los nombres. Tocá la línea en el mapa para agregar otra parada.'}
            </Typography>
            {variantes.length > 1 && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={varianteActiva}
                onChange={(_, v) => v !== null && setVarianteActiva(v)}
              >
                {variantes.map((v, i) => (
                  <ToggleButton key={v.nombre} value={i}>
                    {v.nombre} · {v.paradas.length} paradas
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
            {activa.paradas.length === 0 && (
              <Alert severity="info">
                No se detectó ninguna detención. Tocá la línea para marcar las paradas.
              </Alert>
            )}
            <List dense disablePadding>
              {activa.paradas.map((p, i) => (
                <ListItem
                  key={`${p.latitud}-${p.longitud}`}
                  disableGutters
                  secondaryAction={
                    <IconButton edge="end" size="small" onClick={() => quitarParada(i)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <Chip
                    size="small"
                    label={i + 1}
                    sx={{ mr: 1, minWidth: 32 }}
                    color={p.terminal ? 'error' : 'default'}
                  />
                  <Box sx={{ flexGrow: 1, pr: 5 }}>
                    <TextField
                      size="small"
                      fullWidth
                      value={p.nombre}
                      onChange={(e) => cambiarParada(i, { nombre: e.target.value })}
                    />
                    {p.deViajes != null && (
                      <Typography variant="caption" color="text.secondary">
                        Se detuvo aquí en {p.deViajes} de {p.totalViajes} viajes · ~{p.segundos} s
                      </Typography>
                    )}
                  </Box>
                </ListItem>
              ))}
            </List>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setPaso(1)}>Atrás</Button>
              <Button
                variant="contained"
                disabled={trabajando || variantes.some((v) => v.paradas.length === 0)}
                onClick={guardar}
              >
                Guardar recorrido
              </Button>
            </Stack>
          </Stack>
        )}
      </div>

      <div className={classes.mapa}>
        <MapView>
          {!dibujandoDeCero &&
            variantes.map((v, i) => {
              const esActiva = i === varianteActiva;
              return (
                <LineaEnMapa
                  key={v.nombre}
                  coordenadas={corrigiendo && esActiva ? [] : v.coordenadas}
                  crudo={paso >= 1 && esActiva && (ajusteDudoso || corrigiendo) ? v.crudo : []}
                  paradas={paso === 2 ? v.paradas : []}
                  resaltada={esActiva}
                />
              );
            })}
          {dibujando && (
            <>
              <LineaEnMapa coordenadas={trazado.coordenadas} paradas={[]} resaltada />
              <PuntosEnMapa
                puntos={dibujo.puntos}
                onCambiar={dibujo.cambiar}
                modo={modoToque}
                trazado={trazado}
                soloGuias={corrigiendo}
              />
            </>
          )}
        </MapView>
        <MapScale />
        {encuadre.length > 1 && <MapCamera coordinates={encuadre} />}
      </div>
    </div>
  );
};

export default NuevaLinea;
