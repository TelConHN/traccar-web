import { useState } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useEffectAsync } from '../../reactHelper';
import { formatTime } from '../../common/util/formatter';
import fetchOrThrow from '../../common/util/fetchOrThrow';

// Quién hizo el cambio, dicho para quien lo está mirando. Al cliente no se le da el nombre de la
// persona de Telcon, solo que fue la administración.
export const speedLimitAuthor = (entry, admin) => {
  if (entry.bySelf) {
    return 'usted';
  }
  if (entry.byAdmin && !admin) {
    return 'la administración';
  }
  return entry.by || 'otra cuenta';
};

// Qué pasó con el GPS: [texto, color del Chip].
export const speedLimitGpsStatus = (entry) => {
  if (entry.to == null) {
    return ['Límite quitado', 'default'];
  }
  if (!entry.hardware) {
    return ['Solo alerta en la plataforma', 'default'];
  }
  if (entry.result != null) {
    return ['El GPS respondió', 'success'];
  }
  switch (entry.commandStatus) {
    case 'failed':
      return ['No se pudo enviar al GPS', 'error'];
    case 'queued':
      return entry.queuedSentTime
        ? ['Entregado cuando el GPS se conectó', 'info']
        : ['En cola: el GPS estaba desconectado', 'warning'];
    case 'sent':
      return ['Enviado al GPS, sin respuesta', 'default'];
    default:
      return ['Enviado al GPS', 'default'];
  }
};

const kmh = (value) => (value != null ? `${value} km/h` : 'Sin límite');

const SpeedLimitHistoryDialog = ({ device, admin, onClose }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [items, setItems] = useState(null);

  useEffectAsync(async () => {
    setItems(null);
    if (device) {
      const response = await fetchOrThrow(`/api/devices/${device.id}/speedlimit/history`);
      setItems(await response.json());
    }
  }, [device?.id]);

  return (
    <Dialog open={!!device} onClose={onClose} fullScreen={phone} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="span" display="block">
            Historial del límite de velocidad
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {device?.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {!items &&
          [0, 1, 2].map((index) => (
            <Box key={index} sx={{ px: 3, py: 2 }}>
              <Skeleton width="40%" height={32} />
              <Skeleton width="70%" />
            </Box>
          ))}
        {items && !items.length && (
          <Box sx={{ px: 3, py: 4 }}>
            <Typography variant="body1" gutterBottom>
              Todavía no hay cambios registrados.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Los cambios hechos antes de que existiera este historial no quedaron guardados.
            </Typography>
          </Box>
        )}
        {items?.map((entry) => {
          const [status, color] = speedLimitGpsStatus(entry);
          return (
            <Box
              key={`${entry.time}-${entry.to}`}
              sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: 2,
                  rowGap: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" component="span" color="text.secondary">
                    {kmh(entry.from)}
                  </Typography>
                  <ArrowForwardIcon fontSize="small" color="action" />
                  <Typography variant="h6" component="span">
                    {kmh(entry.to)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Chip size="small" label={status} color={color} variant="outlined" />
                  {entry.resend && <Chip size="small" label="Reenvío" variant="outlined" />}
                  {entry.forced && (
                    <Chip size="small" label="Enviado con el vehículo en exceso" color="warning" />
                  )}
                </Box>
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {formatTime(entry.time, 'minutes')}
                <Typography component="span" variant="body2" color="text.secondary">
                  {` · ${dayjs(entry.time).fromNow()}`}
                </Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Por {speedLimitAuthor(entry, admin)}
                {admin && entry.actor ? ` · pedido por ${entry.actor}` : ''}
              </Typography>
              {entry.queuedSentTime && (
                <Typography variant="caption" color="text.secondary" display="block">
                  Entregado {formatTime(entry.queuedSentTime, 'minutes')}
                </Typography>
              )}
              {entry.commandStatus === 'failed' && entry.commandError && admin && (
                <Typography variant="caption" color="error" display="block">
                  {entry.commandError}
                </Typography>
              )}
              {admin && entry.result != null && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mt: 0.5, wordBreak: 'break-word' }}
                >
                  Respuesta del GPS ({formatTime(entry.resultTime, 'minutes')}):{' '}
                  <Box component="span" sx={{ fontFamily: 'monospace' }}>
                    {entry.result}
                  </Box>
                </Typography>
              )}
            </Box>
          );
        })}
      </DialogContent>
    </Dialog>
  );
};

export default SpeedLimitHistoryDialog;
