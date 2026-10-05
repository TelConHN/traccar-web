import { useSelector } from 'react-redux';

// El lector manda el código como lo lee; al cargar el conductor se escribe a mano. Se compara sin
// importar mayúsculas, espacios ni ceros a la izquierda (algunos lectores los agregan).
export const normalizeDriverId = (value) =>
  String(value ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/^0+(?=.)/, '');

// Formas en que puede estar escrita la misma tarjeta. Los GPS (p. ej. Startek) mandan el número
// en hexadecimal ("72A224"), pero en la tarjeta suele venir impreso en decimal ("0007512612"):
// es el mismo número, y el conductor puede haberse cargado con cualquiera de los dos.
const driverIdForms = (value) => {
  const id = normalizeDriverId(value);
  const forms = new Set([id]);
  if (/^[0-9A-F]+$/.test(id) && id.length <= 12) {
    forms.add(String(parseInt(id, 16)));
  }
  if (/^[0-9]+$/.test(id) && id.length <= 15) {
    forms.add(Number(id).toString(16).toUpperCase());
  }
  return forms;
};

const DriverValue = ({ driverUniqueId }) => {
  const driver = useSelector((state) => {
    const { items } = state.drivers;
    if (items[driverUniqueId]) return items[driverUniqueId];
    const wanted = normalizeDriverId(driverUniqueId);
    const exact = Object.values(items).find((item) => normalizeDriverId(item.uniqueId) === wanted);
    if (exact) return exact;
    const forms = driverIdForms(driverUniqueId);
    return Object.values(items).find((item) =>
      [...driverIdForms(item.uniqueId)].some((form) => forms.has(form)),
    );
  });

  return driver?.name || driverUniqueId;
};

export default DriverValue;
