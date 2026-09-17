// Alertas: por nivel, con la evidencia dibujada en el mapa y los botones de cada desvío.
//
//   Infracción  — desvío sin autorizar, parada obligatoria sin detenerse.
//   Informativo — viajes sin datos suficientes (no es infracción: se dice por qué).
// Tocar una alerta la dibuja en el mapa; el detalle completo está en el viaje.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import {
  Alert,
  Button,
  Chip,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import MapView from '../map/core/MapView';
import MapCamera from '../map/MapCamera';
import MapScale from '../map/MapScale';
import MapMarkers from '../map/MapMarkers';
import { useEffectAsync } from '../reactHelper';
import LineaEnMapa from './LineaEnMapa';
import DesvioAcciones from './DesvioAcciones';
import transporteApi from './api';

const useStyles = makeStyles()((theme) => ({
  contenedor: {
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 520px) 1fr',
    flexGrow: 1,
    minHeight: 0,
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: '1fr',
      gridTemplateRows: 'minmax(200px, 34vh) 1fr',
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

const hoy = () => new Date().toLocaleDateString('en-CA');
const haceDias = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
const cuando = (d) =>
  d
    ? new Date(d).toLocaleString('es-HN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const etiquetaDe = (a) => {
  if (a.tipo === 'desvio') {
    return { abierto: 'Desvío', autorizado: 'Desvío autorizado', descartado: 'Desvío descartado' }[
      a.estado
    ];
  }
  return {
    parada_saltada: 'Parada sin detenerse',
    exceso: 'Exceso de velocidad',
    detencion: 'Detención fuera de parada',
    sin_datos: 'Sin datos',
  }[a.tipo];
};

const colorDe = (a) => {
  if (a.tipo === 'desvio')
    return a.estado === 'abierto' ? 'error' : a.estado === 'autorizado' ? 'success' : 'default';
  return { parada_saltada: 'warning', exceso: 'error', detencion: 'info' }[a.tipo] ?? 'default';
};

const detalleDe = (a) => {
  switch (a.tipo) {
    case 'desvio':
      return `${a.metrosFuera} m fuera del recorrido${a.motivo ? ` · ${a.motivo}` : ''}`;
    case 'parada_saltada':
      return `Pasó por ${a.parada} sin detenerse`;
    case 'exceso':
      return `${a.maxKmh} km/h en un tramo de ${a.limiteKmh} durante ${a.segundos} s`;
    case 'detencion':
      return `${Math.round(a.segundos / 60)} min detenido a ${a.metrosAParada} m de una parada${a.promedioLinea != null ? ` (los demás ~${a.promedioLinea} s)` : ' (ningún otro bus para ahí)'}`;
    default:
      return a.estado === 'sin_datos'
        ? 'El bus no reportó durante el turno'
        : 'El equipo reporta con poca frecuencia: no se evaluó';
  }
};

const Alertas = ({ puedeEditar }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const [desde, setDesde] = useState(haceDias(6));
  const [hasta, setHasta] = useState(hoy());
  const [pestana, setPestana] = useState(0);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [activa, setActiva] = useState(null);

  const cargar = async () => {
    try {
      setDatos(await transporteApi.alertas(desde, hasta));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffectAsync(cargar, [desde, hasta]);

  const lista =
    pestana === 0
      ? (datos?.infracciones ?? [])
      : pestana === 1
        ? (datos?.revisar ?? [])
        : (datos?.informativas ?? []);
  const elegida = lista.find((a) => a.id === activa) ?? null;
  const encuadre = elegida?.trazo
    ? elegida.trazo.map(([lat, lon]) => [lon, lat])
    : elegida?.latitud != null
      ? [[elegida.longitud, elegida.latitud]]
      : [];

  return (
    <div className={classes.contenedor}>
      <div className={classes.panel}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Alertas
        </Typography>
        <Stack direction="row" spacing={1} sx={{ my: 1.5 }}>
          <TextField
            type="date"
            size="small"
            label="Desde"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            label="Hasta"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <Tabs
          value={pestana}
          onChange={(_, v) => {
            setPestana(v);
            setActiva(null);
          }}
          sx={{ mb: 1 }}
        >
          <Tab label={`Infracciones · ${datos?.infracciones.length ?? 0}`} />
          <Tab label={`Para revisar · ${datos?.revisar?.length ?? 0}`} />
          <Tab label={`Informativas · ${datos?.informativas.length ?? 0}`} />
        </Tabs>
        {!datos && !error && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {datos && lista.length === 0 && <Alert severity="success">Nada en estos días.</Alert>}
        <List disablePadding>
          {lista.map((a) => (
            <ListItemButton
              key={a.id}
              selected={activa === a.id}
              onClick={() => setActiva(a.id)}
              divider
              sx={{ alignItems: 'flex-start', flexDirection: 'column' }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                <Chip size="small" color={colorDe(a)} label={etiquetaDe(a)} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {cuando(a.cuando)}
                </Typography>
              </Stack>
              <ListItemText
                primary={`${a.vehiculo} · ${a.linea} · ${a.variante}`}
                secondary={detalleDe(a)}
              />
              {activa === a.id && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ mt: 0.5 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button size="small" onClick={() => navigate(`/transporte/viajes/${a.viajeId}`)}>
                    Ver el viaje
                  </Button>
                  {puedeEditar && a.tipo === 'desvio' && a.estado === 'abierto' && (
                    <DesvioAcciones viajeId={a.viajeId} desvio={{ id: a.id }} onHecho={cargar} />
                  )}
                </Stack>
              )}
            </ListItemButton>
          ))}
        </List>
      </div>
      <div className={classes.mapa}>
        <MapView>
          {elegida?.trazo && (
            <LineaEnMapa coordenadas={elegida.trazo} paradas={[]} color="#d32f2f" resaltada />
          )}
          {elegida?.latitud != null && (
            <MapMarkers markers={[{ latitude: elegida.latitud, longitude: elegida.longitud }]} />
          )}
        </MapView>
        <MapScale />
        {encuadre.length > 0 && (
          <MapCamera
            {...(encuadre.length > 1
              ? { coordinates: encuadre }
              : { latitude: encuadre[0][1], longitude: encuadre[0][0] })}
          />
        )}
      </div>
    </div>
  );
};

export default Alertas;
