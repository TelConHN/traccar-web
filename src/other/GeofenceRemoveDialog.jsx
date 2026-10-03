import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  createdByLabel,
  deviceLink,
  geofenceClients,
  geofenceDeviceIds,
  userLabel,
} from './geofenceAssignments';

// Borrar una geocerca la quita de todos los carros y cuentas que la usan, sin vuelta atrás.
// Si la usa algún cliente o carro, se pide escribir el nombre para que no se borre por un clic.
const GeofenceRemoveDialog = ({ geofence, data, onClose }) => {
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => setConfirmation(''), [geofence?.id]);

  const clients = geofence && data ? geofenceClients(data, geofence.id) : [];
  const deviceIds = geofence && data ? geofenceDeviceIds(data, geofence.id) : [];
  const directCount = deviceIds.filter(
    (id) => deviceLink(data, geofence.id, id) === 'direct',
  ).length;
  const inUse = clients.length > 0 || deviceIds.length > 0;
  const createdBy = createdByLabel(data, geofence);
  const ready = !inUse || confirmation.trim() === (geofence?.name || '').trim();

  const handleRemove = useCatch(async () => {
    await fetchOrThrow(`/api/geofences/${geofence.id}`, { method: 'DELETE' });
    onClose(true);
  });

  return (
    <Dialog open={!!geofence} onClose={() => onClose(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Eliminar geocerca</DialogTitle>
      {geofence && (
        <DialogContent>
          <Typography variant="subtitle1" gutterBottom>
            {geofence.name}
          </Typography>
          {createdBy && (
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Creada por {createdBy}
            </Typography>
          )}
          {inUse ? (
            <>
              <Typography variant="body2" gutterBottom>
                Se quitará, sin vuelta atrás, de:
              </Typography>
              <Typography component="ul" variant="body2" sx={{ pl: 2, mt: 0 }}>
                {clients.length > 0 && (
                  <li>
                    {clients.length === 1 ? 'La cuenta de ' : `${clients.length} cuentas: `}
                    {clients.map(userLabel).join(', ')}
                  </li>
                )}
                {deviceIds.length > 0 && (
                  <li>
                    {deviceIds.length} {deviceIds.length === 1 ? 'carro' : 'carros'}
                    {directCount < deviceIds.length
                      ? ` (${deviceIds.length - directCount} la reciben por grupo)`
                      : ''}
                    . Dejarán de avisar al entrar o salir.
                  </li>
                )}
              </Typography>
              <TextField
                fullWidth
                margin="normal"
                label="Nombre de la geocerca"
                helperText="Escríbelo tal cual para confirmar"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </>
          ) : (
            <Typography variant="body2">Ningún cliente ni carro la usa. ¿Eliminarla?</Typography>
          )}
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancelar</Button>
        <Button color="error" variant="contained" disabled={!ready} onClick={handleRemove}>
          Eliminar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GeofenceRemoveDialog;
