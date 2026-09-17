// Los turnos de Transporte de hoy del conductor, para «Mi ruta»: cada uno con su hora, su bus
// y la lista de paradas con lo que ya pasó. Si no tiene ninguno, no dibuja nada.
import { useEffect, useState } from 'react';
import { Chip, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import transporteApi from './api';
import AbordajeConductor from './AbordajeConductor';
import { RESULTADO, ESTADO_VIAJE } from './ViajeDetalle';

const hora = (d) =>
  d ? new Date(d).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

const MisTurnos = () => {
  const [viajes, setViajes] = useState([]);

  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      transporteApi
        .viajesMios()
        .then((r) => vivo && setViajes(r))
        .catch(() => vivo && setViajes([]));
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  if (viajes.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      {viajes.map((v) => {
        const siguiente = v.paradas.find((p) => p.resultado === 'pendiente');
        return (
          <Paper key={v.id ?? v.turnoId} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <DirectionsBusIcon color="primary" fontSize="small" />
              <Typography fontWeight={600} sx={{ flexGrow: 1 }}>
                {v.linea} · {v.variante}
              </Typography>
              <Chip
                size="small"
                color={ESTADO_VIAJE[v.estado]?.color}
                label={ESTADO_VIAJE[v.estado]?.texto ?? v.estado}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {hora(v.inicio)}–{hora(v.fin)} · {v.vehiculo} · {v.paradas.length} paradas
              {siguiente && v.estado === 'en_curso' ? ` · siguiente: ${siguiente.nombre}` : ''}
            </Typography>
            <List dense disablePadding sx={{ mt: 0.5 }}>
              {v.paradas.map((p) => (
                <ListItem key={p.id} disableGutters sx={{ py: 0 }}>
                  <ListItemText
                    primary={`${p.orden}. ${p.nombre}`}
                    slotProps={{ primary: { variant: 'body2' } }}
                  />
                  {p.resultado !== 'pendiente' && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={RESULTADO[p.resultado]?.color}
                      label={RESULTADO[p.resultado]?.texto}
                    />
                  )}
                </ListItem>
              ))}
            </List>
            {v.id && v.estado === 'en_curso' && (
              <AbordajeConductor viajeId={v.id} paradas={v.paradas} />
            )}
          </Paper>
        );
      })}
    </Stack>
  );
};

export default MisTurnos;
