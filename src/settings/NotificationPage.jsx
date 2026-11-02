import { useState } from 'react';

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  FormControlLabel,
  Checkbox,
  FormGroup,
  Button,
  TextField,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation, useTranslationKeys } from '../common/components/LocalizationProvider';
import EditItemView from './components/EditItemView';
import { prefixString, unprefixString } from '../common/util/stringUtils';
import SelectField from '../common/components/SelectField';
import SettingsMenu from './components/SettingsMenu';
import { useCatch } from '../reactHelper';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';

// Alarmas que calcula VoltageEventHandler con el voltaje del vehículo (no las manda el GPS).
const PLATFORM_ALARMS = ['powerDisconnected', 'lowVoltage', 'powerReconnected'];

const NotificationPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();

  const [item, setItem] = useState();

  const alarms = useTranslationKeys((it) => it.startsWith('alarm')).map((it) => ({
    key: unprefixString('alarm', it),
    name: t(it),
  }));

  const testNotificators = useCatch(async () => {
    await Promise.all(
      item.notificators.split(/[, ]+/).map(async (notificator) => {
        await fetchOrThrow(`/api/notifications/test/${notificator}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
      }),
    );
  });

  const validate = () =>
    item &&
    item.type &&
    item.notificators &&
    (!item.notificators?.includes('command') || item.commandId);

  return (
    <EditItemView
      endpoint="notifications"
      item={item}
      setItem={setItem}
      validate={validate}
      menu={<SettingsMenu />}
      breadcrumbs={['settingsTitle', 'sharedNotification']}
    >
      {item && (
        <>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t('sharedRequired')}</Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <SelectField
                value={item.type}
                onChange={(e) => setItem({ ...item, type: e.target.value })}
                endpoint="/api/notifications/types"
                keyGetter={(it) => it.type}
                titleGetter={(it) => t(prefixString('event', it.type))}
                label={t('sharedType')}
                helperText={
                  ['geofenceEnter', 'geofenceExit'].includes(item.type)
                    ? t('notificationGeofenceLabel')
                    : null
                }
              />
              {item.type === 'alarm' && (
                <SelectField
                  multiple
                  value={
                    item.attributes && item.attributes.alarms
                      ? item.attributes.alarms.split(/[, ]+/)
                      : []
                  }
                  onChange={(e) =>
                    setItem({
                      ...item,
                      attributes: { ...item.attributes, alarms: e.target.value.join() },
                    })
                  }
                  data={alarms}
                  keyGetter={(it) => it.key}
                  label={t('sharedAlarms')}
                />
              )}
              {item.type === 'alarm' &&
                item.attributes?.alarms
                  ?.split(/[, ]+/)
                  .some((alarm) => PLATFORM_ALARMS.includes(alarm)) && (
                  <Alert severity="info">
                    Las alarmas «medidas por la plataforma» no las manda el GPS: las calcula el
                    sistema con el voltaje de la batería del carro («Energía» en el mapa).
                    <br />
                    <b>Batería desconectada:</b> el voltaje cae a menos de 1 V. Vuelve a avisar si
                    la batería estuvo puesta 30 segundos y la quitan otra vez.
                    <br />
                    <b>Voltaje bajo:</b> dos reportes seguidos bajo 11.5 V (uno solo es el bajón al
                    arrancar). No se repite hasta 10 minutos seguidos en 12 V o más.
                    <br />
                    <b>Batería reconectada:</b> vuelve a 11.5 V o más después de una desconexión.
                    <br />
                    Solo avisan después de ver la batería bien una vez desde que se reinició el
                    sistema. Camiones de 24 V: poner 23 en «Umbral de voltaje bajo» del dispositivo;
                    0 lo apaga. Si el GPS también manda «{t('alarmPowerCut')}», pueden llegar los
                    dos avisos por la misma desconexión.
                  </Alert>
                )}
              <SelectField
                multiple
                value={item.notificators ? item.notificators.split(/[, ]+/) : []}
                onChange={(e) => setItem({ ...item, notificators: e.target.value.join() })}
                endpoint="/api/notifications/notificators"
                keyGetter={(it) => it.type}
                titleGetter={(it) => t(prefixString('notificator', it.type))}
                label={t('notificationNotificators')}
              />
              {item.notificators?.includes('command') && (
                <SelectField
                  value={item.commandId}
                  onChange={(e) => setItem({ ...item, commandId: Number(e.target.value) })}
                  endpoint="/api/commands"
                  titleGetter={(it) => it.description}
                  label={t('sharedSavedCommand')}
                />
              )}
              <Button
                variant="outlined"
                color="primary"
                onClick={testNotificators}
                disabled={!item.notificators}
              >
                {t('sharedTestNotificators')}
              </Button>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={item.always}
                      onChange={(e) => setItem({ ...item, always: e.target.checked })}
                    />
                  }
                  label={t('notificationAlways')}
                />
              </FormGroup>
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t('sharedExtra')}</Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                value={item.description || ''}
                onChange={(e) => setItem({ ...item, description: e.target.value })}
                label={t('sharedDescription')}
              />
              <SelectField
                value={item.calendarId}
                onChange={(e) => setItem({ ...item, calendarId: Number(e.target.value) })}
                endpoint="/api/calendars"
                label={t('sharedCalendar')}
              />
              {['geofenceEnter', 'geofenceExit'].includes(item.type) && (
                <SelectField
                  multiple
                  value={item.attributes?.geofenceIds ? item.attributes.geofenceIds.split(',') : []}
                  onChange={(e) => {
                    const geofenceIds = e.target.value.join();
                    const attributes = { ...item.attributes };
                    if (geofenceIds) {
                      attributes.geofenceIds = geofenceIds;
                    } else {
                      delete attributes.geofenceIds;
                    }
                    setItem({ ...item, attributes });
                  }}
                  endpoint="/api/geofences"
                  keyGetter={(it) => String(it.id)}
                  label={t('sharedGeofences')}
                />
              )}
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={item.attributes && item.attributes.priority}
                      onChange={(e) =>
                        setItem({
                          ...item,
                          attributes: { ...item.attributes, priority: e.target.checked },
                        })
                      }
                    />
                  }
                  label={t('sharedPriority')}
                />
              </FormGroup>
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </EditItemView>
  );
};

export default NotificationPage;
