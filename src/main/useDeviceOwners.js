import { useEffect, useState } from 'react';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';

// Administrador que ve (casi) todos los carros, 90% o más: clientes dueños de cada carro ({ deviceId: [{ id, name,
// email }] }), para filtrar y buscar la lista por cliente. A un administrador que ve solo una parte
// el servidor le devuelve {} y el filtro no aparece. Se carga una vez; un cambio aparece al recargar.
export default () => {
  const admin = useAdministrator();
  const [owners, setOwners] = useState({});
  useEffect(() => {
    if (admin) {
      fetchOrThrow('/api/devices/owners')
        .then((response) => response.json())
        .then(setOwners)
        .catch(() => {});
    }
  }, [admin]);
  return owners;
};
