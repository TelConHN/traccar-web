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
  filterUsers,
  geofenceClients,
  geofenceDeviceIds,
  renderUserOption,
  userLabel,
} from './geofenceAssignments';

const link = (geofenceId, deviceIds, method) =>
  fetchOrThrow('/api/permissions/bulk', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deviceIds.map((deviceId) => ({ deviceId, geofenceId }))),
  });

const linkUser = (userId, geofenceId) =>
  fetchOrThrow('/api/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, geofenceId }),
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
  // Cliente elegido en "Dar esta geocerca a otro cliente", esperando que se diga a qué carros.
  const [newClient, setNewClient] = useState(null);
  const [newClientAuto, setNewClientAuto] = useState(false);

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

  // Dar la geocerca a otro cliente: antes solo se podía agregar un carro suelto, y el cliente no la
  // veía en su cuenta (el acceso es de la cuenta, no del carro). Primero se elige la cuenta y luego
  // si va a todos sus carros o a algunos (esos se marcan en su sección, que aparece arriba).
  const clientIds = clients.map((client) => client.id);
  const newClientOptions = Object.values(data.users)
    .filter((user) => !user.administrator && !clientIds.includes(user.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const newClientDevices = newClient
    ? (data.userDevices[newClient.id] || []).filter((id) => data.devices[id])
    : [];
  const newClientMissing = newClientDevices.filter((id) => !deviceLink(data, geofence.id, id));
  const giveToClient = (deviceIds) =>
    run(async () => {
      await linkUser(newClient.id, geofence.id);
      if (deviceIds.length) {
        await link(geofence.id, deviceIds, 'POST');
      }
      if (newClientAuto) {
        await setAuto(newClient.id, true);
      }
      setNewClient(null);
      setNewClientAuto(false);
    });

  const newClientSection = (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Autocomplete
        options={newClientOptions}
        value={newClient}
        disabled={busy}
        onChange={(event, user) => {
          setNewClient(user);
          setNewClientAuto(false);
        }}
        getOptionLabel={(user) => user.name || ''}
        filterOptions={filterUsers}
        renderOption={(props, user) => renderUserOption(props, user)}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText="Ningún cliente coincide"
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Dar esta geocerca a otro cliente"
            helperText="Busca la cuenta por nombre o correo; la verá en su cuenta"
          />
        )}
      />
      {newClient && (
        <Alert severity="info" icon={false} sx={{ mt: 1 }}>
          <Typography variant="body2" gutterBottom>
            {newClientDevices.length === 0
              ? `${newClient.name} todavía no tiene carros. Verá la geocerca en su cuenta; los avisos llegan cuando la tenga algún carro suyo.`
              : `¿A qué carros de ${newClient.name} se aplica? Los avisos de entrada y salida son solo de los carros que la tienen.`}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={newClientAuto}
                disabled={busy}
                onChange={(event) => setNewClientAuto(event.target.checked)}
              />
            }
            label={
              <Typography variant="body2">Y a los carros nuevos que se le agreguen</Typography>
            }
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {newClientMissing.length > 0 && (
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => giveToClient(newClientMissing)}
              >
                {newClientDevices.length === 1
                  ? 'A su carro'
                  : `A todos sus carros (${newClientDevices.length})`}
              </Button>
            )}
            <Button
              size="small"
              variant={newClientMissing.length > 0 ? 'outlined' : 'contained'}
              disabled={busy}
              onClick={() => giveToClient([])}
            >
              {newClientDevices.length > 1 ? 'Elegir cuáles' : 'Solo darle acceso'}
            </Button>
            <Button size="small" disabled={busy} onClick={() => setNewClient(null)}>
              Cancelar
            </Button>
          </Box>
          {newClientDevices.length > 1 && (
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1 }}>
              Con «Elegir cuáles», sus carros aparecen arriba con una casilla cada uno.
            </Typography>
          )}
        </Alert>
      )}
    </Box>
  );

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
          Ningún cliente ve esta geocerca. Para dársela a uno, búscalo abajo en «Dar esta geocerca a
          otro cliente».
        </Typography>
      )}
      {clientSections}
      {newClientSection}
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
            label="Agregar un carro suelto"
            helperText="Solo ese carro; su cliente no la verá en su cuenta. Busca por nombre, IMEI o cliente"
          />
        )}
      />
    </>
  );
};

export default GeofenceDevicesPanel;
