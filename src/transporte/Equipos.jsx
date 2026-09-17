// Equipos GPS: si el GPS de cada bus reporta con la frecuencia necesaria, y qué se puede
// evaluar por eso. Se mide cada día con las posiciones reales del bus (TRANSPORTE.md §2).
//
// El nivel de intervalo que se le pidió al equipo y si lo aplicó viven en el panel admin
// (Configuración → Intervalo de equipos): este servicio no lee la zona de facturación a
// propósito, así que acá se dice y se manda ahí.
import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffectAsync } from '../reactHelper';
import { APTITUD } from './ViajeDetalle';
import transporteApi from './api';

const Equipos = ({ perfil }) => {
  const [equipos, setEquipos] = useState(null);
  const [error, setError] = useState('');

  useEffectAsync(async () => {
    try {
      setEquipos(await transporteApi.equipos());
    } catch (e) {
      setError(e.message);
    }
  }, [perfil?.clienteElegido?.id]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Typography variant="h5" component="h1" fontWeight={600}>
        Equipos GPS
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Cada bus se mide todos los días con sus propias posiciones. Con reportes cada 30 s o menos
        andando se evalúan desvíos y paradas; con 15 s o menos, también velocidad. Un equipo que
        reporta menos seguido no se evalúa, y la pantalla lo dice en vez de inventar alertas.
      </Typography>
      {!equipos && !error && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {equipos && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Bus</TableCell>
              <TableCell>Aptitud hoy</TableCell>
              <TableCell align="right">Cada</TableCell>
              <TableCell align="right">p90</TableCell>
              <TableCell align="right">Posiciones</TableCell>
              <TableCell align="right">Horarios</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {equipos.map((e) => (
              <TableRow key={e.traccarDeviceId} hover>
                <TableCell>{e.nombre}</TableCell>
                <TableCell>
                  {e.aptitud ? (
                    <Chip
                      size="small"
                      color={APTITUD[e.aptitud.nivel]?.color}
                      label={APTITUD[e.aptitud.nivel]?.texto ?? e.aptitud.nivel}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Todavía sin medir (se mide al correr un horario)
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{e.aptitud ? `${e.aptitud.medianaSeg} s` : '—'}</TableCell>
                <TableCell align="right">{e.aptitud ? `${e.aptitud.p90Seg} s` : '—'}</TableCell>
                <TableCell align="right">{e.aptitud?.posiciones ?? '—'}</TableCell>
                <TableCell align="right">{e.turnos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Alert severity="info" sx={{ mt: 2 }}>
        El intervalo que se le pidió a cada equipo y si lo aplicó se ve en el panel de TelConHN
        (Configuración → Intervalo de equipos). Si un bus sale «insuficiente» varios días, es un
        equipo a revisar.
      </Alert>
    </Box>
  );
};

export default Equipos;
