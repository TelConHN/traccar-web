import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch, useEffectAsync } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { prefixString } from '../common/util/stringUtils';
import { filterUsers, renderUserOption } from './geofenceAssignments';

// Los avisos de una geocerca son notificaciones de verdad (Ajustes → Notificaciones), marcadas con
// avisoDeGeocerca. Este panel solo las crea, cambia y borra: así lo que se ve aquí y lo que se ve en
// Notificaciones es siempre lo mismo. Ver NotificationManager (geocercas que vigilan todos los carros).
const TYPES = [
  { type: 'geofenceEnter', label: 'Avisar cuando un carro ENTRA', suffix: 'entrada' },
  { type: 'geofenceExit', label: 'Avisar cuando un carro SALE', suffix: 'salida' },
];

const DEFAULT_CHANNELS = ['web', 'mail', 'firebase'];

// Todos los canales que conoce TelConHN, se puedan usar o no en este servidor: así se ve que existen
// aunque aquí estén apagados (en local solo hay web).
const KNOWN_CHANNELS = [
  { type: 'web', hint: 'campana y aviso en pantalla de la plataforma' },
  { type: 'mail', hint: 'correo de la cuenta' },
  { type: 'firebase', hint: 'notificación en el celular, app TelConHN' },
  { type: 'telegram', hint: 'chat de Telegram' },
  { type: 'sms', hint: 'mensaje de texto' },
];

const json = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const link = (userId, notificationId, method) =>
  fetchOrThrow('/api/permissions', { method, ...json({ userId, notificationId }) });

const GeofenceAlertsPanel = ({ geofence, admins, currentUserId }) => {
  const t = useTranslation();
  const navigate = useNavigate();

  const [channelOptions, setChannelOptions] = useState([]);
  const [notifications, setNotifications] = useState({});
  const [recipients, setRecipients] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [channelsResponse, allResponse] = await Promise.all([
      fetchOrThrow('/api/notifications/notificators'),
      fetchOrThrow('/api/notifications?all=true'),
    ]);
    setChannelOptions(
      (await channelsResponse.json()).map((it) => it.type).filter((type) => type !== 'command'),
    );
    const own = (await allResponse.json()).filter(
      (it) => Number(it.attributes?.avisoDeGeocerca) === geofence.id,
    );
    const byType = {};
    own.forEach((it) => {
      byType[it.type] = it;
    });
    setNotifications(byType);
    const ownIds = own.map((it) => it.id);
    const linked = await Promise.all(
      admins.map(async (admin) => {
        const response = await fetchOrThrow(`/api/notifications?userId=${admin.id}`);
        const ids = (await response.json()).map((it) => it.id);
        return ids.some((notificationId) => ownIds.includes(notificationId)) ? admin.id : null;
      }),
    );
    setRecipients(linked.filter(Boolean));
    setLoaded(true);
  };

  useEffectAsync(load, [geofence.id, admins.length]);

  const active = TYPES.map(({ type }) => notifications[type]).filter(Boolean);
  // Sin avisos todavía: web, correo y push, los que el servidor tenga activos.
  const defaultChannels = DEFAULT_CHANNELS.filter((type) => channelOptions.includes(type));
  const channels = active[0]?.notificators
    ? active[0].notificators.split(/[, ]+/)
    : defaultChannels.length
      ? defaultChannels
      : ['web'];

  // Quién lo recibe por defecto: quien la está configurando.
  const currentRecipients = recipients.length ? recipients : [currentUserId];

  const toggleType = useCatch(async ({ type, suffix }, enabled) => {
    const existing = notifications[type];
    if (!enabled && existing) {
      await fetchOrThrow(`/api/notifications/${existing.id}`, { method: 'DELETE' });
    } else if (enabled && !existing) {
      const response = await fetchOrThrow('/api/notifications', {
        method: 'POST',
        ...json({
          type,
          always: true,
          notificators: channels.join(','),
          description: `${geofence.name} · ${suffix}`,
          attributes: { geofenceIds: String(geofence.id), avisoDeGeocerca: geofence.id },
        }),
      });
      const created = await response.json();
      // Quien la crea queda vinculado solo; se agregan los demás y se quita él si no la quería.
      await Promise.all(
        currentRecipients
          .filter((userId) => userId !== currentUserId)
          .map((userId) => link(userId, created.id, 'POST')),
      );
      if (!currentRecipients.includes(currentUserId)) {
        await link(currentUserId, created.id, 'DELETE');
      }
    }
    await load();
  });

  const toggleChannel = useCatch(async (type, enabled) => {
    const types = enabled ? [...channels, type] : channels.filter((it) => it !== type);
    const value = types.join(',');
    await Promise.all(
      active.map((notification) =>
        fetchOrThrow(`/api/notifications/${notification.id}`, {
          method: 'PUT',
          ...json({ ...notification, notificators: value }),
        }),
      ),
    );
    await load();
  });

  const changeRecipients = useCatch(async (users) => {
    const next = users.map((user) => user.id);
    const added = next.filter((userId) => !recipients.includes(userId));
    const removed = recipients.filter((userId) => !next.includes(userId));
    await Promise.all(
      active.flatMap((notification) => [
        ...added.map((userId) => link(userId, notification.id, 'POST')),
        ...removed.map((userId) => link(userId, notification.id, 'DELETE')),
      ]),
    );
    await load();
  });

  if (!loaded) {
    return null;
  }
  return (
    <>
      {TYPES.map((entry) => (
        <FormControlLabel
          key={entry.type}
          control={
            <Checkbox
              checked={!!notifications[entry.type]}
              onChange={(event) => toggleType(entry, event.target.checked)}
            />
          }
          label={entry.label}
        />
      ))}
      {active.length > 0 && (
        <>
          <Typography variant="subtitle2">Por dónde avisar</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {[
              ...KNOWN_CHANNELS,
              ...channelOptions
                .filter((type) => !KNOWN_CHANNELS.some((it) => it.type === type))
                .map((type) => ({ type, hint: '' })),
            ].map(({ type, hint }) => {
              const available = channelOptions.includes(type);
              const checked = available && channels.includes(type);
              const last = checked && channels.length === 1;
              let detail = hint;
              if (!available) {
                detail = 'no está activado en este servidor';
              } else if (last) {
                detail = `${hint} · debe quedar al menos uno; para no avisar, desmarque ENTRA y SALE`;
              }
              return (
                <FormControlLabel
                  key={type}
                  disabled={!available || last}
                  control={
                    <Checkbox
                      checked={checked}
                      onChange={(event) => toggleChannel(type, event.target.checked)}
                    />
                  }
                  label={
                    <>
                      {t(prefixString('notificator', type))}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {detail && ` — ${detail}`}
                      </Typography>
                    </>
                  }
                />
              );
            })}
          </Box>
          <Autocomplete
            multiple
            options={admins}
            value={admins.filter((user) => recipients.includes(user.id))}
            onChange={(event, users) => changeRecipients(users)}
            getOptionLabel={(user) => user.name || user.email || ''}
            filterOptions={filterUsers}
            renderOption={(props, user) => renderUserOption(props, user)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="A quién avisar"
                helperText="Solo cuentas de administración. El cliente nunca recibe este aviso."
              />
            )}
          />
          <Typography variant="subtitle2">Aparecen en Ajustes → Notificaciones como:</Typography>
          {active.map((notification) => (
            <Box
              key={notification.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
            >
              <NotificationsActiveIcon fontSize="small" color="primary" />
              <Typography variant="body2" sx={{ flex: '1 1 200px' }}>
                {notification.description}
              </Typography>
              <Button
                size="small"
                onClick={() => navigate(`/settings/notification/${notification.id}`)}
              >
                Ver notificación
              </Button>
            </Box>
          ))}
        </>
      )}
    </>
  );
};

export default GeofenceAlertsPanel;
