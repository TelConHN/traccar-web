import { useEffect, useState } from 'react';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';

// Administrador: clientes dueños de cada carro ({ deviceId: [{ id, name, email }] }), para filtrar
// y buscar la lista por cliente. Se carga una vez; un carro asignado después aparece al recargar.
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
