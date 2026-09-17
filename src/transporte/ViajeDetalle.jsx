// Un viaje: el recorrido real del bus contra la línea, qué pasó en cada parada y cada desvío
// con su evidencia. Es la pantalla a la que llevan las alertas y los buses de «Hoy».
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MapView from '../map/core/MapView';
import MapCamera from '../map/MapCamera';
import MapScale from '../map/MapScale';
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

export const RESULTADO = {
  se_detuvo: { texto: 'Se detuvo', color: 'success' },
  paso_sin_detenerse: { texto: 'Pasó sin detenerse', color: 'warning' },
  sin_datos: { texto: 'Sin datos suficientes', color: 'default' },
  pendiente: { texto: 'Pendiente', color: 'default' },
};

export const ESTADO_VIAJE = {
  programado: { texto: 'Programado', color: 'default' },
  en_curso: { texto: 'En curso', color: 'primary' },
  terminado: { texto: 'Terminado', color: 'success' },
  sin_datos: { texto: 'Sin datos', color: 'default' },
};

export const APTITUD = {
  completo: { texto: 'Equipo apto completo', color: 'success' },
  desvios_y_paradas: { texto: 'Equipo apto para desvíos y paradas', color: 'info' },
  insuficiente: { texto: 'Equipo con datos insuficientes: no se evaluó', color: 'warning' },
};

const hora = (d) =>
  d ? new Date(d).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';
const fecha = (d) =>
  new Date(d).toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

const ViajeDetalle = ({ viajeId, puedeEditar }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const theme = { error: '#d32f2f', success: '#2e7d32', warning: '#ed6c02', gris: '#9e9e9e' };
  const [viaje, setViaje] = useState(null);
  const [error, setError] = useState('');
  const [desvioActivo, setDesvioActivo] = useState(null);

  const cargar = async () => {
    try {
      setViaje(await transporteApi.viaje(viajeId));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffectAsync(cargar, [viajeId]);

  const paradasColoreadas = (viaje?.paradas ?? []).map((p) => ({
    ...p,
    color:
      { se_detuvo: theme.success, paso_sin_detenerse: theme.warning, sin_datos: theme.gris }[
        p.paso.resultado
      ] ?? null,
  }));
  const trazoReal = (viaje?.trazo ?? []).map(([lat, lon]) => [lat, lon]);
  const encuadre = (viaje?.variante.geometria ?? []).map(([lat, lon]) => [lon, lat]);
  const aptitud = viaje?.aptitudNivel ? APTITUD[viaje.aptitudNivel] : null;

  return (
    <div className={classes.contenedor}>
      <div className={classes.panel}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <IconButton size="small" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="h6" component="h1" fontWeight={600} sx={{ flexGrow: 1 }}>
            {viaje ? `${viaje.linea.nombre} · ${viaje.variante.nombre}` : 'Viaje'}
          </Typography>
        </Stack>
        {!viaje && !error && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {viaje && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Chip size="small" label={viaje.turno.vehiculo} />
              <Chip
                size="small"
                color={ESTADO_VIAJE[viaje.estado]?.color}
                label={ESTADO_VIAJE[viaje.estado]?.texto ?? viaje.estado}
              />
              <Typography variant="body2" color="text.secondary">
                {fecha(viaje.fecha)} · {viaje.turno.horaInicio}–{viaje.turno.horaFin}
                {viaje.inicioEn &&
                  ` · real ${hora(viaje.inicioEn)}${viaje.finEn ? `–${hora(viaje.finEn)}` : ''}`}
              </Typography>
            </Stack>
            {aptitud && (
              <Alert severity={aptitud.color === 'warning' ? 'warning' : 'info'} sx={{ py: 0 }}>
                {aptitud.texto}
                {viaje.aptitud &&
                  ` · reporta cada ~${viaje.aptitud.medianaSeg} s andando (p90 ${viaje.aptitud.p90Seg} s)`}
              </Alert>
            )}

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Parada</TableCell>
                  <TableCell align="right">Hora</TableCell>
                  <TableCell>Qué pasó</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {viaje.paradas.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>{p.orden}</TableCell>
                    <TableCell>
                      {p.nombre}
                      {!p.obligatoria && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          opcional
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{hora(p.paso.horaPaso)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={RESULTADO[p.paso.resultado]?.color}
                        label={RESULTADO[p.paso.resultado]?.texto ?? p.paso.resultado}
                      />
                      {p.paso.segundosDetenido != null && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          detenido ~{p.paso.segundosDetenido} s
                          {p.paso.inferido ? ' (inferido por el tiempo entre posiciones)' : ''}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="subtitle2">Desvíos · {viaje.desvios.length}</Typography>
            {viaje.desvios.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Ninguno en este viaje.
              </Typography>
            )}
            {viaje.desvios.map((d) => (
              <Stack
                key={d.id}
                spacing={0.5}
                sx={{
                  p: 1.25,
                  border: '1px solid',
                  borderColor: desvioActivo === d.id ? 'error.main' : 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                }}
                onClick={() => setDesvioActivo(desvioActivo === d.id ? null : d.id)}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    color={
                      { abierto: 'error', autorizado: 'success', descartado: 'default' }[d.estado]
                    }
                    label={
                      {
                        abierto: 'Sin resolver',
                        autorizado: 'Autorizado',
                        descartado: 'Descartado',
                      }[d.estado]
                    }
                  />
                  <Typography variant="body2">
                    {hora(d.desde)}
                    {d.hasta ? `–${hora(d.hasta)}` : ' (sigue fuera)'} · {d.metrosFuera} m fuera
                  </Typography>
                </Stack>
                {d.motivo && (
                  <Typography variant="caption" color="text.secondary">
                    {d.motivo}
                  </Typography>
                )}
                {puedeEditar && d.estado === 'abierto' && (
                  <DesvioAcciones viajeId={viaje.id} desvio={d} onHecho={cargar} />
                )}
              </Stack>
            ))}
            <Typography variant="subtitle2">
              Excesos de velocidad · {viaje.excesos?.length ?? 0}
            </Typography>
            {(viaje.excesos ?? []).map((x) => (
              <Typography key={x.id} variant="body2">
                {hora(x.desde)} · {x.maxKmh} km/h en tramo de {x.limiteKmh} durante {x.segundos} s
              </Typography>
            ))}
            {viaje.aptitudNivel && viaje.aptitudNivel !== 'completo' && (
              <Typography variant="caption" color="text.secondary">
                La velocidad no se evaluó: el equipo no reporta cada 15 s o menos.
              </Typography>
            )}

            <Typography variant="subtitle2">
              Detenciones fuera de parada ·{' '}
              {(viaje.detenciones ?? []).filter((d) => !d.habitual).length}
            </Typography>
            {(viaje.detenciones ?? []).map((d) => (
              <Typography
                key={d.id}
                variant="body2"
                color={d.habitual ? 'text.secondary' : 'text.primary'}
              >
                {hora(d.desde)} · {Math.round(d.segundos / 60)} min a {d.metrosAParada} m de una
                parada
                {d.habitual
                  ? ' · lugar donde se detienen todos (semáforo, peaje)'
                  : d.promedioLinea != null
                    ? ` · los demás buses paran ~${d.promedioLinea} s ahí`
                    : ' · ningún otro bus de la línea se detiene ahí'}
              </Typography>
            ))}

            <Button size="small" onClick={() => navigate('/transporte/alertas')}>
              Ver todas las alertas
            </Button>
          </Stack>
        )}
      </div>

      <div className={classes.mapa}>
        <MapView>
          {viaje && (
            <>
              <LineaEnMapa
                coordenadas={viaje.variante.geometria}
                crudo={trazoReal}
                paradas={paradasColoreadas}
                resaltada
              />
              {viaje.desvios
                .filter((d) => desvioActivo === null || d.id === desvioActivo)
                .map((d) => (
                  <LineaEnMapa
                    key={d.id}
                    coordenadas={d.trazo}
                    paradas={[]}
                    color={theme.error}
                    resaltada={d.id === desvioActivo}
                  />
                ))}
            </>
          )}
        </MapView>
        <MapScale />
        {encuadre.length > 1 && <MapCamera coordinates={encuadre} />}
      </div>
    </div>
  );
};

export default ViajeDetalle;
