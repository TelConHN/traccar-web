import { useSelector } from 'react-redux';

export const useAdministrator = () =>
  useSelector((state) => {
    const admin = state.session.user.administrator;
    return admin;
  });

export const useManager = () =>
  useSelector((state) => {
    const admin = state.session.user.administrator;
    const manager = (state.session.user.userLimit || 0) !== 0;
    return admin || manager;
  });

export const useDeviceReadonly = () =>
  useSelector((state) => {
    const admin = state.session.user.administrator;
    const serverReadonly = state.session.server.readonly;
    const userReadonly = state.session.user.readonly;
    const serverDeviceReadonly = state.session.server.deviceReadonly;
    const userDeviceReadonly = state.session.user.deviceReadonly;
    return !admin && (serverReadonly || userReadonly || serverDeviceReadonly || userDeviceReadonly);
  });

export const useRestriction = (key) =>
  useSelector((state) => {
    const admin = state.session.user.administrator;
    const serverValue = state.session.server[key];
    const userValue = state.session.user[key];
    return !admin && (serverValue || userValue);
  });

// Reportes habilitados para la cuenta. Es la misma regla del servidor (ClientRestrictions): sin
// el atributo, que nunca se configuró, solo el recorrido; el servidor rechaza los demás.
export const allowedReportKeys = (user) => {
  const value = user?.attributes?.allowedReports;
  if (value == null) {
    return ['replay'];
  }
  return String(value).split(',').filter(Boolean);
};

export const useReportAllowed = (key) =>
  useSelector((state) => {
    const { user, server } = state.session;
    if (user.administrator) {
      return true;
    }
    return !user.disableReports && !server.disableReports && allowedReportKeys(user).includes(key);
  });
