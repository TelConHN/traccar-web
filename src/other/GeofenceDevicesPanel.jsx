import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  deviceClients,
  deviceLink,
  geofenceClients,
  geofenceDeviceIds,
  userLabel,
} from './geofenceAssignments';

const link = (geofenceId, deviceIds, method) =>
  fetchOrThrow('/api/permissions/bulk', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deviceIds.map((deviceId) => ({ deviceId, geofenceId }))),
  });

const unlinkUser = (userId, geofenceId) =>
  fetchOrThrow('/api/permissions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, geofenceId }),
  });

const deviceLabel = (device) => (device ? `${device.name} · ${device.uniqueId}` : 'Carro borrado');

// Carros con la geocerca, agrupados por el cliente que la ve. Cada cambio se aplica al instante;
// nada se agrega solo salvo que se prenda "agregar a sus carros nuevos" para ese cliente.
const GeofenceDevicesPanel = ({
  geofence,
  data,
  onChanged,
  onGeofenceChanged,
  onClientRemoved,
}) => {
  const [busy, setBusy] = useState(false);
  const [removingClientId, setRemovingClientId] = useState(null);

  const setAuto = async (userId, enabled) => {
    const response = await fetchOrThrow(
      `/api/geofences/${geofence.id}/auto?userId=${userId}&enabled=${enabled}`,
      { method: 'PUT' },
    );
    onGeofenceChanged(await response.json());
  };

  // Quita al cliente (y si se pide, la geocerca de sus carros). El agregado automático para
  // ese cliente también se apaga: sin acceso ya no tendría efecto y quedaría como basura.
  const removeClient = (client, deviceIds, auto) =>
    run(async () => {
      if (deviceIds.length) {
        await link(geofence.id, deviceIds, 'DELETE');
      }
      if (auto) {
        await setAuto(client.id, false);
      }
      await unlinkUser(client.id, geofence.id);
      setRemovingClientId(null);
      onClientRemoved(client.id);
    });

  const run = useCatch(async (action) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } finally {
      setBusy(false);
    }
  });

  const clients = geofenceClients(data, geofence.id);
  const autoUsers = String(geofence.attributes?.autoAgregarUsuarios || '')
    .split(',')
    .filter(Boolean)
    .map(Number);

  const shownDeviceIds = new Set();
  const clientSections = clients.map((client) => {
    const deviceIds = (data.userDevices[client.id] || []).filter((id) => data.devices[id]);
    deviceIds.forEach((id) => shownDeviceIds.add(id));
    const missing = deviceIds.filter((id) => !deviceLink(data, geofence.id, id));
    const auto = autoUsers.includes(client.id);
    const linkedDirect = deviceIds.filter((id) => deviceLink(data, geofence.id, id) === 'direct');
    return (
      <Box key={client.id} sx={{ mb: 2 }}>
        <Typography variant="subtitle2">{userLabel(client)}</Typography>
        {deviceIds.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            Este cliente no tiene carros todavía.
          </Typography>
        ) : (
          <List dense disablePadding>
            {deviceIds.map((deviceId) => {
              const state = deviceLink(data, geofence.id, deviceId);
              return (
                <ListItem key={deviceId} disableGutters>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Checkbox
                      edge="start"
                      checked={!!state}
                      disabled={busy || state === 'group'}
                      onChange={(event) =>
                        run(() =>
                          link(geofence.id, [deviceId], event.target.checked ? 'POST' : 'DELETE'),
                        )
                      }
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={deviceLabel(data.devices[deviceId])}
                    secondary={
                      state === 'group' ? 'La recibe por su grupo; se cambia en el grupo' : null
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
        {missing.length > 0 && (
          <Button
            size="small"
            disabled={busy}
            onClick={() => run(() => link(geofence.id, missing, 'POST'))}
          >
            {missing.length === 1
              ? 'Agregar al que falta'
              : `Agregar a los ${missing.length} que faltan`}
          </Button>
        )}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={auto}
              disabled={busy}
              onChange={(event) => run(() => setAuto(client.id, event.target.checked))}
            />
          }
          label={
            <Typography variant="body2">
              Agregarla sola a los carros nuevos de este cliente
            </Typography>
          }
        />
        {removingClientId === client.id ? (
          <Alert severity="warning" sx={{ mt: 1 }}>
            <Typography variant="body2" gutterBottom>
              {client.name} dejará de ver esta geocerca en su cuenta.
              {linkedDirect.length > 0 &&
                ` ${linkedDirect.length === 1 ? 'Uno de sus carros la tiene' : `${linkedDirect.length} de sus carros la tienen`}: ¿también se la quito?`}
            </Typography>
            {linkedDirect.length > 0 && (
              <Button
                size="small"
                color="warning"
                disabled={busy}
                onClick={() => removeClient(client, linkedDirect, auto)}
              >
                Quitar el acceso y la geocerca de sus carros
              </Button>
            )}
            <Button
              size="small"
              color="warning"
              disabled={busy}
              onClick={() => removeClient(client, [], auto)}
            >
              {linkedDirect.length > 0 ? 'Quitar solo el acceso' : 'Quitar el acceso'}
            </Button>
            <Button size="small" disabled={busy} onClick={() => setRemovingClientId(null)}>
              Cancelar
            </Button>
          </Alert>
        ) : (
          <Button
            size="small"
            color="error"
            disabled={busy}
            onClick={() => setRemovingClientId(client.id)}
          >
            Quitar a este cliente
          </Button>
        )}
      </Box>
    );
  });

  // Carros con la geocerca que no son de ningún cliente de arriba (p. ej. de Telcon u otro cliente).
  const others = geofenceDeviceIds(data, geofence.id).filter((id) => !shownDeviceIds.has(id));

  // Cualquier carro que todavía no la tenga (sirve sobre todo para las geocercas de Telcon).
  const ownerNames = {};
  Object.entries(data.userDevices).forEach(([userId, deviceIds]) => {
    const user = data.users[userId];
    if (user && !user.administrator) {
      deviceIds.forEach((id) => {
        ownerNames[id] = ownerNames[id] ? `${ownerNames[id]}, ${user.name}` : user.name;
      });
    }
  });
  const addableDevices = Object.values(data.devices)
    .filter((device) => !deviceLink(data, geofence.id, device.id))
    .map((device) => ({
      id: device.id,
      label: `${deviceLabel(device)}${ownerNames[device.id] ? ` · ${ownerNames[device.id]}` : ''}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      {clients.length === 0 && (
        <Typography variant="body2" color="textSecondary">
          Ningún cliente ve esta geocerca. Para dársela a uno, elige &quot;De un cliente&quot;
          arriba y guarda.
        </Typography>
      )}
      {clientSections}
      {others.length > 0 && (
        <Box>
          <Typography variant="subtitle2">Otros carros con esta geocerca</Typography>
          <List dense disablePadding>
            {others.map((deviceId) => {
              const state = deviceLink(data, geofence.id, deviceId);
              const owners = deviceClients(data, deviceId).map(userLabel).join(', ');
              return (
                <ListItem key={deviceId} disableGutters>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Checkbox
                      edge="start"
                      checked
                      disabled={busy || state === 'group'}
                      onChange={() => run(() => link(geofence.id, [deviceId], 'DELETE'))}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={deviceLabel(data.devices[deviceId])}
                    secondary={[
                      owners ? `De ${owners}` : 'Sin cliente (Telcon)',
                      state === 'group' ? 'por su grupo' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </ListItem>
              );
            })}
          </List>
        </Box>
      )}
      <Autocomplete
        sx={{ mt: 2 }}
        options={addableDevices}
        value={null}
        disabled={busy}
        onChange={(event, device) => device && run(() => link(geofence.id, [device.id], 'POST'))}
        getOptionLabel={(option) => option.label}
        noOptionsText="Ningún carro coincide"
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Agregar otro carro"
            helperText="Busca por nombre, IMEI o cliente"
          />
        )}
      />
    </>
  );
};

export default GeofenceDevicesPanel;
