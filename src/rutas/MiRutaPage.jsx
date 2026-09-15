// Pantalla del conductor: dónde está, qué sigue y cómo va la ruta.
//
// Lo que NO tiene, a propósito: el mapa de la flota, los demás vehículos, los reportes y la
// configuración. Pero esconder botones no es seguridad — lo que de verdad lo limita es que su
// usuario solo tiene permiso sobre el vehículo de la jornada que trae activa.
//
// La posición del vehículo **no se pide**: llega sola por el WebSocket que la aplicación ya
// mantiene abierto y que deja cada posición en el estado compartido. Abrir una segunda vía
// para el mismo dato sería pagarlo dos veces.
import { useState, useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Alert,
  Toolbar,
  IconButton,
  LinearProgress,
  Chip,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List as ListMui,
  ListItemButton,
  useMediaQuery,
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import BackIcon from '../common/components/BackIcon';
import MapView from '../map/core/MapView';
import MapRouteCoordinates from '../map/MapRouteCoordinates';
import MapMarkers from '../map/MapMarkers';
import MapPositions from '../map/MapPositions';
import MapCamera from '../map/MapCamera';
import BottomMenu from '../common/components/BottomMenu';
import { useEffectAsync } from '../reactHelper';
import rutasApi from './api';

const useStyles = makeStyles()((theme) => ({
  // height y flexGrow a la vez: esta pantalla es hija directa del contenido de la aplicacion
  // —que NO es flex— cuando la abre el conductor, y de un contenedor flex cuando la abre el
  // administrador desde «Ver como conductor». Cada propiedad cubre uno de los dos casos.
  contenedor: {
    height: '100%',
    flexGrow: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    // En escritorio la ruta va en una columna a la izquierda y el mapa ocupa todo lo demás,
    // igual que el mapa principal de Traccar. `row-reverse` en vez de reordenar el JSX: en el
    // teléfono el mapa tiene que ir primero —arriba— y así el mismo orden sirve para los dos.
    [theme.breakpoints.up('md')]: { flexDirection: 'row-reverse' },
  },
  mapa: {
    flexBasis: '42%',
    flexShrink: 0,
    position: 'relative',
    minHeight: 240,
    [theme.breakpoints.up('md')]: { flexBasis: 'auto', flexGrow: 1, minHeight: 0 },
  },
  // La columna entera: la ruta arriba y, abajo, el menú de siempre de Traccar. Es donde el
  // conductor busca su cuenta y el botón de salir, y sin él esta pantalla no tenía salida.
  columna: {
    flexGrow: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('md')]: {
      flexGrow: 0,
      flexShrink: 0,
      width: theme.dimensions.drawerWidthDesktop,
      borderRight: `1px solid ${theme.palette.divider}`,
    },
  },
  panel: { flexGrow: 1, minHeight: 0, overflow: 'auto', padding: theme.spacing(2) },
  siguiente: { backgroundColor: theme.palette.action.hover },
  numero: { width: 28, height: 28, fontSize: '0.78rem', fontWeight: 600 },
  hecho: { textDecoration: 'line-through', color: theme.palette.text.disabled },
  barra: { height: 8, borderRadius: 4 },
}));

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

// El día, corto, para las rutas que no son de hoy. Al mediodía para que el cambio de zona
// horaria no la corra un día hacia atrás.
const dia = (f) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric' });

const ETIQUETA = {
  pendiente: { texto: 'Pendiente', color: 'default' },
  en_sitio: { texto: 'Estás aquí', color: 'info' },
  // «Visitada» decía que el GPS te vio entrar y salir, pero nadie dijo qué pasó adentro.
  // Nombrarlo así es lo que hace que el conductor entienda que falta algo suyo.
  visitada: { texto: 'Falta confirmar', color: 'warning' },
  entregado: { texto: 'Entregado', color: 'success' },
  no_entregado: { texto: 'No se pudo', color: 'warning' },
};

const HECHAS = ['entregado', 'no_entregado', 'visitada'];

// Los motivos que de verdad pasan en un reparto. Elegir de una lista se hace con una mano y
// dentro de un carro; escribir, no. «Otro» queda para lo que no entre acá, y ahí sí se pide
// el detalle: una entrega fallida sin explicación obliga a llamar al conductor, que es
// justamente lo que este módulo viene a evitar.
const MOTIVOS = [
  'Nadie recibió',
  'Local cerrado',
  'El cliente rechazó la entrega',
  'Dirección equivocada',
  'No se pudo llegar (calle bloqueada)',
  'Producto dañado o incompleto',
];

const MiRutaPage = () => {
  const { classes, cx } = useStyles();
  const escritorio = useMediaQuery((theme) => theme.breakpoints.up('md'));

  // `?jornada=` es la vista previa del administrador: la misma pantalla del conductor, con los
  // mismos datos. Nadie ve nada que no pudiera ver igual — el servidor sigue filtrando por
  // dueño o conductor asignado.
  const [params] = useSearchParams();
  const previa = params.get('jornada');
  const navigate = useNavigate();

  const [jornadaId, setJornadaId] = useState(previa);
  // Todas las rutas que le tocan, ya ordenadas por hora de salida. Un encargado puede cargarle
  // dos o tres el mismo día; sin la lista, el conductor veía una sola y no sabía que había
  // otra después —ni cuál iba primero—.
  const [mias, setMias] = useState([]);
  // La que está mirando, cuando toca otra a mano. Nula = la que le toca ahora.
  const [elegida, setElegida] = useState(null);
  const [jornada, setJornada] = useState(null);
  const [datos, setDatos] = useState(null);
  const [trazo, setTrazo] = useState([]);
  const [avance, setAvance] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState(null);
  const [otroMotivo, setOtroMotivo] = useState('');
  // Sus avisos sin leer: que le despacharon una ruta, que la ruta cambió, que salió de una
  // parada sin marcar. Vienen del servidor, que es quien sabe que pasaron.
  const [avisos, setAvisos] = useState([]);

  // La posición del vehículo, en vivo: se actualiza sola cada vez que el GPS reporta.
  const posicion = useSelector((state) =>
    jornada ? state.session.positions[jornada.traccarDeviceId] : null,
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      let id = previa;
      if (!previa) {
        const [perfil, suyos] = await Promise.all([
          rutasApi.perfil(),
          rutasApi.notificaciones({ soloNoLeidas: true, limite: 5 }).catch(() => ({ items: [] })),
        ]);
        setAvisos(suyos.items);
        const lista = perfil.jornadas ?? [];
        setMias(lista);
        // Se respeta la que el conductor tocó, mientras siga en su lista; si no, la que le
        // toca ahora. Así marcar una entrega no lo devuelve a otra ruta.
        id = lista.some((j) => j.id === elegida) ? elegida : perfil.jornadaActiva;
      }
      setJornadaId(id);
      if (!id) {
        setDatos(null);
        return;
      }
      const [cumplimiento, ficha] = await Promise.all([
        rutasApi.cumplimiento(id),
        rutasApi.jornada(id),
      ]);
      setDatos(cumplimiento);
      setJornada(ficha);
      try {
        const t = await rutasApi.trazo(id);
        setTrazo(t.coordenadas.map((c) => [c.longitud, c.latitud]));
      } catch {
        setTrazo([]);
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [previa, elegida]);

  useEffectAsync(cargar, [previa, elegida]);

  // Se vuelve a preguntar cada 45 segundos mientras la ruta está en curso. Es la única forma
  // de que un cambio hecho desde la oficina llegue al teléfono sin que el conductor recargue:
  // el WebSocket de Traccar trae posiciones, no cambios de plan. Son unos cientos de bytes.
  useEffect(() => {
    if (!jornadaId || previa) return undefined;
    const t = setInterval(cargar, 45000);
    return () => clearInterval(t);
  }, [jornadaId, previa, cargar]);

  // El camino que falta se recalcula con cada posición nueva del GPS. Eso es lo que hace un
  // navegador: no repetir la ruta que se planificó, sino trazar la que queda desde donde
  // estás — y si el conductor se salió, la línea se corrige sola.
  useEffectAsync(async () => {
    if (!jornadaId) return;
    try {
      setAvance(await rutasApi.avance(jornadaId));
    } catch {
      setAvance(null);
    }
  }, [jornadaId, posicion?.fixTime, datos]);

  const marcar = async (paradaId, tipo, nota) => {
    setEnviando(true);
    try {
      if (tipo === 'punto_corregido') {
        // La coordenada la da el navegador, pero el servidor NO se fía de ella: la compara
        // con la última posición del GPS del vehículo. Acá solo se pide con qué comparar.
        const pos = await new Promise((ok, falla) =>
          navigator.geolocation.getCurrentPosition(ok, falla, {
            enableHighAccuracy: true,
            timeout: 10000,
          }),
        );
        await rutasApi.marcarParada(jornadaId, paradaId, {
          tipo,
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
        });
      } else {
        await rutasApi.marcarParada(jornadaId, paradaId, { tipo, nota: nota ?? null });
      }
      await cargar();
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // La que sigue después de la que está abierta. Vale null cuando es la última del día.
  const indiceRuta = mias.findIndex((j) => j.id === jornadaId);
  const siguienteRuta = indiceRuta >= 0 ? (mias[indiceRuta + 1] ?? null) : null;
  const despachada = jornada?.estado === 'despachada';

  const paradas = datos?.paradas ?? [];
  const indiceSiguiente = paradas.findIndex((p) => !HECHAS.includes(p.estado));
  const siguiente = indiceSiguiente >= 0 ? paradas[indiceSiguiente] : null;
  const hechas = paradas.filter((p) => HECHAS.includes(p.estado)).length;
  const restante = (avance?.restante?.coordenadas ?? []).map((c) => [c.longitud, c.latitud]);

  // Las paradas hechas se apagan y la siguiente va marcada en otro color: en un teléfono,
  // dentro de un carro en movimiento, el color es lo único que se lee de un vistazo.
  const marcadores = paradas.map((p, i) => {
    let imagen = 'default-info';
    if (HECHAS.includes(p.estado)) imagen = 'default-neutral';
    else if (i === indiceSiguiente) imagen = 'default-error';
    return {
      latitude: p.punto.latitud,
      longitude: p.punto.longitud,
      image: imagen,
      title: String(i + 1),
    };
  });

  return (
    <div className={classes.contenedor}>
      <div className={classes.mapa}>
        <MapView>
          {/* El plan completo va tenue, de fondo; lo que falta por recorrer va marcado
              encima. Es la misma lectura de un navegador: el trazo fuerte es tu camino. */}
          <MapRouteCoordinates name="Plan" coordinates={trazo} />
          <MapRouteCoordinates name="Falta" coordinates={restante} />
          <MapMarkers markers={marcadores} showTitles />
          {/* El vehículo, con el mismo ícono y color que en el mapa principal de Traccar. */}
          <MapPositions positions={posicion ? [posicion] : []} titleField="name" />
        </MapView>
        {/* La cámara sigue al vehículo: el conductor no tiene que buscarse en el mapa. Sin
            posición todavía, encuadra la ruta completa. */}
        <MapCamera
          {...(posicion
            ? { latitude: posicion.latitude, longitude: posicion.longitude }
            : { coordinates: trazo })}
        />
      </div>

      <Dialog open={motivo !== null} onClose={() => setMotivo(null)} fullWidth maxWidth="xs">
        <DialogTitle>¿Por qué no se pudo entregar?</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <ListMui disablePadding>
            {MOTIVOS.map((m) => (
              <ListItemButton key={m} selected={motivo === m} onClick={() => setMotivo(m)}>
                <ListItemText primary={m} />
              </ListItemButton>
            ))}
            <ListItemButton selected={motivo === 'otro'} onClick={() => setMotivo('otro')}>
              <ListItemText primary="Otro" />
            </ListItemButton>
          </ListMui>
          {motivo === 'otro' && (
            <TextField
              label="Contá qué pasó"
              size="small"
              fullWidth
              multiline
              minRows={2}
              autoFocus
              sx={{ p: 2 }}
              value={otroMotivo}
              onChange={(e) => setOtroMotivo(e.target.value)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMotivo(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={enviando || !motivo || (motivo === 'otro' && !otroMotivo.trim())}
            onClick={async () => {
              const texto = motivo === 'otro' ? otroMotivo.trim() : motivo;
              setMotivo(null);
              await marcar(siguiente.id, 'no_entregado', texto);
            }}
          >
            Registrar
          </Button>
        </DialogActions>
      </Dialog>

      <div className={classes.columna}>
        {/* Cuando llega el encargado desde «Seguir», esta pantalla es de otro: hay que decirle
            de quién es y, sobre todo, dejarlo volver. El conductor no ve esta barra —él no
            viene de ningún lado, esta es su pantalla. */}
        {previa && (
          <Toolbar variant="dense" sx={{ borderBottom: 1, borderColor: 'divider', gap: 1 }}>
            <IconButton edge="start" onClick={() => navigate('/rutas/cargadas')}>
              <BackIcon />
            </IconButton>
            <Typography variant="subtitle2">Así la ve el conductor</Typography>
          </Toolbar>
        )}
        <div className={classes.panel}>
          <Stack spacing={2}>
            {cargando && <LinearProgress />}
            {error && (
              <Alert severity="warning" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {!cargando && !jornadaId && (
              <Alert severity="info">No tenés ninguna ruta asignada en este momento.</Alert>
            )}

            {/* Las rutas del día, en el orden en que se manejan. Solo aparece cuando hay más
                de una: con una sola sería un título de adorno arriba de la única cosa que
                hay en pantalla. */}
            {mias.length > 1 && (
              <Paper variant="outlined">
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ px: 1.5, pt: 1, display: 'block' }}
                >
                  Tus rutas · {mias.length}
                </Typography>
                <List dense disablePadding>
                  {mias.map((j, i) => (
                    <ListItemButton
                      key={j.id}
                      selected={j.id === jornadaId}
                      divider={i < mias.length - 1}
                      onClick={() => setElegida(j.id)}
                    >
                      <ListItemAvatar sx={{ minWidth: 42 }}>
                        <Avatar className={classes.numero}>{i + 1}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={j.nombre || `Ruta ${i + 1}`}
                        secondary={`${hora(j.salida)} a ${hora(j.fin)} · ${j.paradas} paradas${
                          j.esHoy ? '' : ` · ${dia(j.fecha)}`
                        }`}
                      />
                      {j.estado !== 'despachada' && (
                        <Chip size="small" label="Sin despachar" color="warning" />
                      )}
                    </ListItemButton>
                  ))}
                </List>
              </Paper>
            )}

            {/* Cerrar un aviso lo marca leído: no vuelve a aparecer en la próxima vuelta. */}
            {avisos.map((a) => (
              <Alert
                key={a.id}
                severity={a.tipo === 'salio_sin_marcar' ? 'warning' : 'info'}
                onClose={async () => {
                  setAvisos((lista) => lista.filter((x) => x.id !== a.id));
                  await rutasApi.marcarLeidas([a.id]).catch(() => {});
                }}
              >
                <strong>{a.titulo}</strong>
                <br />
                {a.detalle}
              </Alert>
            ))}

            {/* Que no le agarre de sorpresa: si hay otra después, se dice desde ya a qué hora
                y desde dónde arranca. Es la misma pregunta que haría por teléfono. */}
            {siguienteRuta && (
              <Alert severity="info" icon={false}>
                Al terminar esta sigue{' '}
                <strong>{siguienteRuta.nombre || 'la siguiente ruta'}</strong>: sale{' '}
                {hora(siguienteRuta.salida)}
                {siguienteRuta.origen ? ` desde ${siguienteRuta.origen}` : ''}.
              </Alert>
            )}

            {/* Una ruta cargada pero no despachada no tiene geocercas ni permisos: el servidor
                rechaza cualquier entrega. Vale más decirlo que dejarlo tocar botones que
                devuelven error. */}
            {jornada && jornada.estado !== 'despachada' && (
              <Alert severity="warning">
                Esta ruta todavía no fue despachada. Podés verla, pero no marcar entregas hasta que
                tu encargado la suelte.
              </Alert>
            )}

            {datos && (
              <>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography variant="subtitle2">
                        {hechas} de {paradas.length} paradas
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {avance?.restante
                          ? `Faltan ${avance.restante.km} km · ${avance.restante.minutos} min`
                          : posicion
                            ? `Última señal ${hora(posicion.deviceTime ?? posicion.fixTime)}`
                            : 'Sin señal del vehículo'}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      className={classes.barra}
                      variant="determinate"
                      value={paradas.length ? (100 * hechas) / paradas.length : 0}
                    />
                  </Stack>
                </Paper>

                {paradas.some((p) => p.sinConfirmar) && (
                  <Alert severity="warning">
                    {paradas.filter((p) => p.sinConfirmar).length === 1
                      ? 'Pasaste por una parada y no dijiste qué pasó. Confirmala abajo.'
                      : `Pasaste por ${paradas.filter((p) => p.sinConfirmar).length} paradas y no dijiste qué pasó.`}
                  </Alert>
                )}

                {siguiente ? (
                  <Card variant="outlined" className={classes.siguiente}>
                    <CardContent>
                      <Typography variant="overline" color="primary">
                        Siguiente parada · {indiceSiguiente + 1} de {paradas.length}
                      </Typography>
                      <Typography variant="h6">{siguiente.punto.nombre}</Typography>
                      {siguiente.llegadaGps && (
                        <Typography variant="body2" color="warning.main" gutterBottom>
                          El GPS registró que llegaste a las {hora(siguiente.llegadaGps)}. ¿Qué pasó
                          acá?
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {avance?.siguiente
                          ? `A ${avance.siguiente.km} km · ${avance.siguiente.minutos} min · llegás ${hora(avance.siguiente.llegadaEstimada)}`
                          : `Estimada ${hora(siguiente.horaEstimada)}`}
                      </Typography>
                      {/* Sin despachar no hay geocercas ni permiso sobre el vehículo: el
                          servidor rechaza la entrega. El aviso de arriba ya lo explica. */}
                      {despachada && (
                        <Stack spacing={1} sx={{ mt: 1.5 }}>
                          <Stack direction="row" spacing={1}>
                            <Button
                              variant="contained"
                              fullWidth
                              disabled={enviando}
                              onClick={() => marcar(siguiente.id, 'entregado')}
                            >
                              Entregado
                            </Button>
                            <Button
                              variant="outlined"
                              fullWidth
                              disabled={enviando}
                              onClick={() => {
                                setMotivo('');
                                setOtroMotivo('');
                              }}
                            >
                              No se pudo
                            </Button>
                          </Stack>
                          <Button
                            variant="outlined"
                            fullWidth
                            startIcon={<MyLocationIcon />}
                            disabled={enviando}
                            onClick={() => marcar(siguiente.id, 'punto_corregido')}
                          >
                            El punto es aquí
                          </Button>
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Alert severity="success">
                    Terminaste la ruta: {hechas} de {paradas.length} paradas.
                  </Alert>
                )}

                <Paper variant="outlined">
                  <List dense disablePadding>
                    {paradas.map((p, i) => (
                      <ListItem
                        key={p.id}
                        divider={i < paradas.length - 1}
                        secondaryAction={
                          <Chip
                            size="small"
                            label={(ETIQUETA[p.estado] ?? { texto: p.estado }).texto}
                            color={(ETIQUETA[p.estado] ?? {}).color ?? 'default'}
                          />
                        }
                      >
                        <ListItemAvatar sx={{ minWidth: 42 }}>
                          <Avatar className={classes.numero}>{i + 1}</Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={p.punto.nombre}
                          secondary={
                            p.motivo
                              ? p.motivo
                              : p.horaLlegada
                                ? `Llegaste ${hora(p.horaLlegada)}`
                                : `Estimada ${hora(p.horaEstimada)}`
                          }
                          slotProps={{
                            primary: { className: cx(HECHAS.includes(p.estado) && classes.hecho) },
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </>
            )}
          </Stack>
        </div>
        {/* En el teléfono el menú ya lo pone la aplicación al pie de toda pantalla (App.jsx):
            repetirlo acá lo mostraba dos veces y le robaba altura a la ruta. */}
        {escritorio && <BottomMenu />}
      </div>
    </div>
  );
};

export default MiRutaPage;
