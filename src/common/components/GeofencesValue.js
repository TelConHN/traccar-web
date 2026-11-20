import { useSelector } from 'react-redux';

const GeofencesValue = ({ geofenceIds }) => {
  const geofences = useSelector((state) => state.geofences.items);

  // Una geocerca de Telcon que vigila todos los carros no está en la lista del cliente: sin nombre, no se muestra.
  return geofenceIds
    .map((id) => geofences[id]?.name)
    .filter(Boolean)
    .join(', ');
};

export default GeofencesValue;
