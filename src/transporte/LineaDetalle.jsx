// Un recorrido: su trazo, sus variantes y sus paradas, y lo que se les puede cambiar.
//
// Tocar el mapa hace una de dos cosas, según el modo elegido en el panel: agregar una parada
// sobre la línea, o cortar la variante en ida y vuelta en ese punto. Fuera de esos modos, tocar
// no hace nada: es la forma de que nadie agregue paradas por accidente arrastrando el mapa.
//
// «Corregir el trazo» reparte la línea en puntos guía (EditorTrazo) para arrastrar los que van por
// la calle equivocada. Al guardar, el servidor reubica paradas, tramos de velocidad y cierres
// autorizados sobre la línea nueva.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import EditRoadIcon from '@mui/icons-material/EditRoad';
import MapView, { map } from '../map/core/MapView';
import MapCamera from '../map/MapCamera';
import MapScale from '../map/MapScale';
import { useEffectAsync } from '../reactHelper';
import LineaEnMapa from './LineaEnMapa';
import TramosLinea from './TramosLinea';
import transporteApi from './api';
import { prepararLinea, recortar, colorDeLimite } from './geo';
import { PanelTrazo, PuntosEnMapa, puntosDesdeTrazo, usePuntos, useTrazado } from './EditorTrazo';

const useStyles = makeStyles()((theme) => ({
  contenedor: {
    display: 'grid',
    gridTemplateColumns: 'minmax(340px, 460px) 1fr',
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
  mapa: { position: 'relative', minHeight: 0, [theme.breakpoints.down('md')]: { order: 1 } },
}));

const km = (m) => `${(m / 1000).toFixed(1)} km`;

/// Metros entre dos coordenadas, plano: alcanza de sobra para comparar el principio y el final.
const metrosEntre = ([la1, lo1], [la2, lo2]) =>
  Math.hypot((lo2 - lo1) * 111320 * Math.cos((la1 * Math.PI) / 180), (la2 - la1) * 110540);

/// Un recorrido que termina donde empezó. Misma regla que el servidor usa para el enlace público
/// (routes/seguir.js): sin esto, en la pantalla no había forma de saber si el bus vuelve al mismo
/// punto o termina en el otro extremo, que es lo primero que se pregunta al mirar un recorrido.
const esCircuito = (g) => g?.length > 2 && metrosEntre(g[0], g[g.length - 1]) < 150;

const LineaDetalle = ({ lineaId, puedeEditar, operacion, limitador = false }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const [linea, setLinea] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [varianteActiva, setVarianteActiva] = useState(0);
  const [modoToque, setModoToque] = useState(null); // 'parada' | 'cortar' | 'tramo' | null
  // Marcar un tramo de velocidad: primer toque = inicio, segundo = fin.
  const [inicioTramo, setInicioTramo] = useState(null);
  const [tramoNuevo, setTramoNuevo] = useState(null);
  const [capas, setCapas] = useState([]);
  // Los tramos con límite de la variante que se está mirando. Se dibujan siempre: antes solo
  // aparecían mientras se editaban, así que al abrir un recorrido no había forma de ver en qué
  // pedazo rige el 60 —y es lo primero que se pregunta cuando salta una alerta de velocidad—.
  const [tramos, setTramos] = useState([]);
  const [nuevaParada, setNuevaParada] = useState(null); // { latitud, longitud, nombre }
  const [editando, setEditando] = useState(null); // parada en edición
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState('');
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [guardandoTrazo, setGuardandoTrazo] = useState(false);
  const dibujo = usePuntos();

  const cargar = async () => {
    try {
      const l = await transporteApi.linea(lineaId);
      setLinea(l);
      setNombre(l.nombre);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffectAsync(cargar, [lineaId]);

  const activa = linea?.variantes[varianteActiva];

  useEffectAsync(async () => {
    if (!linea || !activa) return;
    try {
      setTramos(await transporteApi.tramos(linea.id, activa.id));
    } catch {
      setTramos([]);
    }
  }, [linea?.id, activa?.id]);

  /// Los tramos como capas del mapa, con su color y el límite escrito encima. Mientras se editan
  /// los pone TramosLinea (en `capas`), así que acá no se repiten.
  const capasDeTramos =
    activa && !corrigiendo && capas.length === 0
      ? tramos
          .filter((t) => t.desdeMetro != null)
          .map((t) => ({
            clave: `lim-${t.id ?? t.desdeMetro}`,
            coordenadas: recortar(prepararLinea(activa.geometria), t.desdeMetro, t.hastaMetro),
            color: colorDeLimite(t.limiteKmh),
            etiqueta: `${t.limiteKmh} km/h${t.nombre ? ` · ${t.nombre}` : ''}`,
          }))
      : [];
  const trazado = useTrazado(dibujo.puntos, corrigiendo);

  const empezarCorreccion = () => {
    setModoToque(null);
    setInicioTramo(null);
    dibujo.reiniciar(puntosDesdeTrazo(activa.geometria));
    setCorrigiendo(true);
  };

  const guardarTrazo = async () => {
    setGuardandoTrazo(true);
    setError('');
    try {
      const r = await transporteApi.editarVariante(linea.id, activa.id, {
        geometria: trazado.coordenadas,
      });
      setCorrigiendo(false);
      setAviso(
        r.tramosARevisar > 0
          ? `Trazo guardado. Las paradas se reubicaron, pero ${r.tramosARevisar} tramo(s) de velocidad o cierre(s) quedaron en una calle que el recorrido ya no usa: revisalos.`
          : 'Trazo guardado. Las paradas y los tramos de velocidad se reubicaron sobre la línea nueva.',
      );
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardandoTrazo(false);
    }
  };

  const estadoRef = useRef({});
  estadoRef.current = { modoToque, activa, linea, inicioTramo };
  useEffect(() => {
    const alTocar = async (e) => {
      const s = estadoRef.current;
      if (!s.modoToque || !s.activa) return;
      const punto = { latitud: e.lngLat.lat, longitud: e.lngLat.lng };
      if (s.modoToque === 'parada') {
        setNuevaParada({ ...punto, nombre: `Parada ${s.activa.paradas.length + 1}` });
      } else if (s.modoToque === 'tramo') {
        if (!s.inicioTramo) {
          setInicioTramo(punto);
        } else {
          setTramoNuevo({ desde: s.inicioTramo, hasta: punto });
          setInicioTramo(null);
          setModoToque(null);
        }
      } else if (s.modoToque === 'cortar') {
        try {
          await transporteApi.cortarVariante(s.linea.id, s.activa.id, punto);
          setModoToque(null);
          setAviso('La variante quedó partida en ida y vuelta.');
          await cargar();
        } catch (err) {
          setError(err.message);
        }
      }
    };
    map.on('click', alTocar);
    return () => map.off('click', alTocar);
  }, []);

  const accion = async (fn, mensaje) => {
    setError('');
    try {
      await fn();
      if (mensaje) setAviso(mensaje);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const guardarNuevaParada = () =>
    accion(async () => {
      await transporteApi.agregarParada(linea.id, activa.id, {
        nombre: nuevaParada.nombre.trim() || 'Parada',
        latitud: nuevaParada.latitud,
        longitud: nuevaParada.longitud,
        ...(operacion === 'linea' ? { privada: false } : {}),
      });
      setNuevaParada(null);
      setModoToque(null);
    }, 'Parada agregada.');

  const guardarEdicion = () =>
    accion(async () => {
      await transporteApi.editarParada(linea.id, editando.id, {
        nombre: editando.nombre.trim() || 'Parada',
        radioMetros: Number(editando.radioMetros),
        obligatoria: editando.obligatoria,
        terminal: editando.terminal,
        privada: editando.privada,
      });
      setEditando(null);
    });

  // Memorizado: MapCamera vuelve a encuadrar con cada arreglo nuevo, y sin esto el mapa saltaba
  // con cada cambio de estado (por ejemplo, mientras se corrige el trazo).
  const encuadre = useMemo(
    () => (activa?.geometria ?? []).map(([lat, lon]) => [lon, lat]),
    [activa],
  );

  return (
    <div className={classes.contenedor}>
      <div className={classes.panel}>
        {!linea && !error && <LinearProgress />}
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {aviso && (
          <Alert severity="success" onClose={() => setAviso('')} sx={{ mb: 1.5 }}>
            {aviso}
          </Alert>
        )}
        {linea && (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              {editandoNombre ? (
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  onBlur={() => {
                    setEditandoNombre(false);
                    if (nombre.trim() && nombre !== linea.nombre) {
                      accion(() => transporteApi.editarLinea(linea.id, { nombre: nombre.trim() }));
                    }
                  }}
                />
              ) : (
                <>
                  <Typography variant="h6" component="h1" fontWeight={600} sx={{ flexGrow: 1 }}>
                    {linea.nombre}
                  </Typography>
                  {puedeEditar && (
                    <IconButton size="small" onClick={() => setEditandoNombre(true)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </>
              )}
            </Stack>
            {!linea.activa && <Alert severity="warning">Este recorrido está desactivado.</Alert>}

            {linea.variantes.length > 1 && (
              <ToggleButtonGroup
                exclusive
                size="small"
                fullWidth
                disabled={corrigiendo}
                value={varianteActiva}
                onChange={(_, v) => v !== null && setVarianteActiva(v)}
              >
                {linea.variantes.map((v, i) => (
                  <ToggleButton key={v.id} value={i}>
                    {v.nombre}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}

            {activa && (
              <>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip size="small" label={km(activa.metros)} />
                  <Chip size="small" label={`${activa.paradas.length} paradas`} />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      esCircuito(activa.geometria)
                        ? `Circuito · sale y vuelve a ${activa.paradas[0]?.nombre ?? 'la terminal'}`
                        : `Sale de ${activa.paradas[0]?.nombre ?? '—'} y termina en ${activa.paradas.at(-1)?.nombre ?? '—'}`
                    }
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Tolerancia ${activa.anchoMetros} m`}
                  />
                  {activa.origen === 'viaje' && activa.confianza != null && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Grabada · confianza ${Math.round(activa.confianza * 100)}%`}
                    />
                  )}
                  {activa.origen === 'importada' && (
                    <Chip size="small" variant="outlined" label="Importada" />
                  )}
                </Stack>

                {puedeEditar && corrigiendo && (
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Corregir el trazo{linea.variantes.length > 1 ? ` · ${activa.nombre}` : ''}
                    </Typography>
                    <PanelTrazo
                      puntos={dibujo.puntos}
                      onCambiar={dibujo.cambiar}
                      onDeshacer={dibujo.deshacer}
                      puedeDeshacer={dibujo.puedeDeshacer}
                      trazado={trazado}
                      soloGuias
                    />
                    <Stack direction="row" spacing={1}>
                      <Button onClick={() => setCorrigiendo(false)} disabled={guardandoTrazo}>
                        Cancelar
                      </Button>
                      <Button
                        variant="contained"
                        disabled={
                          guardandoTrazo || trazado.cargando || trazado.coordenadas.length < 2
                        }
                        onClick={guardarTrazo}
                      >
                        Guardar trazo
                      </Button>
                    </Stack>
                  </Stack>
                )}

                {puedeEditar && !corrigiendo && (
                  <Stack spacing={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<EditRoadIcon />}
                      onClick={empezarCorreccion}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Corregir el trazo
                    </Button>
                    <TextField
                      select
                      size="small"
                      label="Paradas obligatorias"
                      value={linea.paradasObligatorias}
                      onChange={(e) =>
                        accion(() =>
                          transporteApi.editarLinea(linea.id, {
                            paradasObligatorias: e.target.value,
                          }),
                        )
                      }
                    >
                      <MenuItem value="todas">Toda parada es obligatoria</MenuItem>
                      <MenuItem value="con_pasajeros">
                        Solo detenerse si hay pasajeros (pasar de largo es solo información)
                      </MenuItem>
                    </TextField>
                    <TextField
                      select
                      size="small"
                      label="Ancho de tolerancia para desvíos"
                      value={activa.anchoMetros}
                      onChange={(e) =>
                        accion(() =>
                          transporteApi.editarVariante(linea.id, activa.id, {
                            anchoMetros: Number(e.target.value),
                          }),
                        )
                      }
                    >
                      <MenuItem value={60}>60 m — ciudad</MenuItem>
                      <MenuItem value={100}>100 m — carretera</MenuItem>
                      <MenuItem value={150}>150 m — zona sin mapa detallado</MenuItem>
                    </TextField>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      fullWidth
                      value={modoToque}
                      onChange={(_, v) => setModoToque(v)}
                    >
                      <ToggleButton value="parada">
                        <AddLocationAltIcon fontSize="small" sx={{ mr: 0.5 }} />
                        Agregar parada
                      </ToggleButton>
                      <ToggleButton value="cortar">
                        <ContentCutIcon fontSize="small" sx={{ mr: 0.5 }} />
                        Cortar en ida y vuelta
                      </ToggleButton>
                      <ToggleButton value="tramo">Marcar tramo</ToggleButton>
                    </ToggleButtonGroup>
                    {modoToque === 'tramo' && (
                      <Alert severity="info">
                        {inicioTramo
                          ? 'Ahora tocá dónde termina el tramo.'
                          : 'Tocá sobre la línea dónde empieza el tramo con límite.'}
                      </Alert>
                    )}
                    {modoToque === 'parada' && (
                      <Alert severity="info">Tocá sobre la línea donde va la parada.</Alert>
                    )}
                    {modoToque === 'cortar' && (
                      <Alert severity="info">
                        Tocá la línea en la terminal: hasta ahí queda la ida, y desde ahí la vuelta.
                      </Alert>
                    )}
                  </Stack>
                )}

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Parada</TableCell>
                      <TableCell align="right">Km</TableCell>
                      <TableCell align="right">Radio</TableCell>
                      {puedeEditar && <TableCell />}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activa.paradas.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>{p.orden}</TableCell>
                        <TableCell>
                          {p.nombre}
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                            {p.terminal && <Chip size="small" color="error" label="Terminal" />}
                            {!p.obligatoria && (
                              <Chip size="small" variant="outlined" label="Opcional" />
                            )}
                            {operacion !== 'linea' && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={p.privada ? 'Privada' : 'Pública'}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{(p.metroEnLinea / 1000).toFixed(1)}</TableCell>
                        <TableCell align="right">{p.radioMetros} m</TableCell>
                        {puedeEditar && (
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            <Tooltip title="Editar">
                              <IconButton size="small" onClick={() => setEditando({ ...p })}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Quitar">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  accion(() => transporteApi.borrarParada(linea.id, p.id))
                                }
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            {activa && (
              <TramosLinea
                key={activa.id}
                linea={linea}
                variante={activa}
                puedeEditar={puedeEditar}
                conLimitador={limitador}
                tramoNuevo={tramoNuevo}
                onTramoUsado={() => setTramoNuevo(null)}
                onCapas={setCapas}
                onCambioLinea={cargar}
              />
            )}

            {puedeEditar && linea.activa && (
              <Button
                color="error"
                size="small"
                onClick={() =>
                  accion(async () => {
                    await transporteApi.borrarLinea(linea.id);
                    navigate('/transporte/recorridos');
                  })
                }
              >
                Desactivar recorrido
              </Button>
            )}
          </Stack>
        )}
      </div>

      <div className={classes.mapa}>
        <MapView>
          {linea?.variantes.map((v, i) => (
            <LineaEnMapa
              key={v.id}
              coordenadas={v.geometria}
              paradas={v.paradas}
              resaltada={i === varianteActiva && !corrigiendo}
            />
          ))}
          {corrigiendo && (
            <>
              <LineaEnMapa
                coordenadas={trazado.coordenadas}
                paradas={[]}
                resaltada
                color="#1a73e8"
              />
              <PuntosEnMapa
                puntos={dibujo.puntos}
                onCambiar={dibujo.cambiar}
                trazado={trazado}
                soloGuias
              />
            </>
          )}
          {[...capas, ...capasDeTramos].map((c) => (
            <LineaEnMapa
              key={c.clave}
              coordenadas={c.coordenadas}
              paradas={[]}
              color={c.color}
              etiqueta={c.etiqueta}
              resaltada
            />
          ))}
        </MapView>
        <MapScale />
        {encuadre.length > 1 && <MapCamera coordinates={encuadre} />}
      </div>

      <Dialog
        open={Boolean(nuevaParada)}
        onClose={() => setNuevaParada(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Nueva parada</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Nombre"
            sx={{ mt: 1 }}
            value={nuevaParada?.nombre ?? ''}
            onChange={(e) => setNuevaParada((p) => ({ ...p, nombre: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNuevaParada(null)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarNuevaParada}>
            Agregar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editando)} onClose={() => setEditando(null)} fullWidth maxWidth="xs">
        <DialogTitle>Editar parada</DialogTitle>
        <DialogContent>
          {editando && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <TextField
                size="small"
                label="Nombre"
                value={editando.nombre}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              />
              <TextField
                size="small"
                type="number"
                label="Radio (m)"
                helperText="Nunca menor que velocidad × intervalo del equipo ÷ 2; el sistema lo revisa al evaluar."
                value={editando.radioMetros}
                onChange={(e) => setEditando({ ...editando, radioMetros: e.target.value })}
                slotProps={{ htmlInput: { min: 20, max: 500 } }}
              />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2">Obligatoria</Typography>
                <Switch
                  checked={editando.obligatoria}
                  onChange={(e) => setEditando({ ...editando, obligatoria: e.target.checked })}
                />
              </Stack>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2">Terminal</Typography>
                <Switch
                  checked={editando.terminal}
                  onChange={(e) => setEditando({ ...editando, terminal: e.target.checked })}
                />
              </Stack>
              {operacion !== 'linea' && (
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <div>
                    <Typography variant="body2">Privada</Typography>
                    <Typography variant="caption" color="text.secondary">
                      La casa de alguien: nunca sale en un enlace de grupo ni público.
                    </Typography>
                  </div>
                  <Switch
                    checked={editando.privada}
                    onChange={(e) => setEditando({ ...editando, privada: e.target.checked })}
                  />
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditando(null)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarEdicion}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default LineaDetalle;
