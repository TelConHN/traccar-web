import { createFilterOptions, ListItemText } from '@mui/material';
import fetchOrThrow from '../common/util/fetchOrThrow';

// Respuesta de GET /api/geofences/assignments (solo administradores) convertida en índices.
export const fetchAssignments = async () => {
  const response = await fetchOrThrow('/api/geofences/assignments');
  const data = await response.json();
  const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
  return {
    users: byId(data.users),
    devices: byId(data.devices),
    groups: byId(data.groups),
    userDevices: data.userDevices,
    geofenceUsers: data.geofenceUsers,
    geofenceDevices: data.geofenceDevices,
    geofenceGroups: data.geofenceGroups,
  };
};

// En el campo se ve solo el nombre (el correo no cabe en el teléfono); se busca por los dos
// y la lista desplegable muestra el correo debajo.
export const filterUsers = createFilterOptions({
  stringify: (user) => `${user.name || ''} ${user.email || ''}`,
});

export const renderUserOption = (props, user, extra) => {
  const { key, ...rest } = props;
  return (
    <li key={key} {...rest}>
      <ListItemText
        primary={extra ? `${user.name} — ${extra}` : user.name}
        secondary={user.email !== user.name ? user.email : null}
      />
    </li>
  );
};

export const userLabel = (user) => {
  if (!user) return 'Usuario borrado';
  return user.email && user.email !== user.name ? `${user.name} (${user.email})` : user.name;
};

// Clientes (no administradores) que ven la geocerca en su cuenta.
export const geofenceClients = (data, geofenceId) =>
  (data.geofenceUsers[geofenceId] || [])
    .map((id) => data.users[id])
    .filter((user) => user && !user.administrator);

// Grupos (con sus padres) a los que pertenece un carro.
const deviceGroupChain = (data, device) => {
  const chain = [];
  let groupId = device?.groupId;
  while (groupId && !chain.includes(groupId)) {
    chain.push(groupId);
    groupId = data.groups[groupId]?.groupId;
  }
  return chain;
};

// 'direct' = asignada al carro; 'group' = la recibe por un grupo (se cambia en el grupo); null = no.
export const deviceLink = (data, geofenceId, deviceId) => {
  if ((data.geofenceDevices[geofenceId] || []).includes(deviceId)) return 'direct';
  const groups = data.geofenceGroups[geofenceId] || [];
  if (deviceGroupChain(data, data.devices[deviceId]).some((id) => groups.includes(id))) {
    return 'group';
  }
  return null;
};

export const geofenceDeviceIds = (data, geofenceId) =>
  Object.keys(data.devices)
    .map(Number)
    .filter((deviceId) => deviceLink(data, geofenceId, deviceId));

// Dueños (clientes) de un carro; los administradores tienen todos los carros y no cuentan.
export const deviceClients = (data, deviceId) =>
  Object.entries(data.userDevices)
    .filter(([, deviceIds]) => deviceIds.includes(deviceId))
    .map(([userId]) => data.users[userId])
    .filter((user) => user && !user.administrator);

export const createdByLabel = (data, geofence) => {
  const creatorId = Number(geofence?.attributes?.creadoPor);
  if (!creatorId) return null;
  const user = data?.users[creatorId];
  if (!user) return 'un usuario que ya no existe';
  return user.administrator ? `${user.name} (administración)` : userLabel(user);
};
