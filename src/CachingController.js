import { useDispatch, useSelector } from 'react-redux';
import {
  geofencesActions,
  groupsActions,
  driversActions,
  productsActions,
  maintenancesActions,
  calendarsActions,
} from './store';
import { useAsyncTask } from './reactHelper';
import fetchOrThrow from './common/util/fetchOrThrow';
import fetchDrivers from './common/util/fetchDrivers';
import fetchProducts from './common/util/fetchProducts';

const CachingController = () => {
  const authenticated = useSelector((state) => !!state.session.user);
  const administrator = useSelector((state) => !!state.session.user?.administrator);
  const dispatch = useDispatch();

  useAsyncTask(
    async ({ signal }) => {
      if (authenticated) {
        const response = await fetchOrThrow('api/geofences', { signal });
        dispatch(geofencesActions.refresh(await response.json()));
      }
    },
    [authenticated, dispatch],
  );

  useAsyncTask(
    async ({ signal }) => {
      if (authenticated) {
        const response = await fetchOrThrow('api/groups', { signal });
        dispatch(groupsActions.refresh(await response.json()));
      }
    },
    [authenticated, dispatch],
  );

  // Un administrador trae todos los conductores y productos (ver fetchDrivers / fetchProducts).
  useAsyncTask(async () => {
    if (authenticated) {
      dispatch(driversActions.refresh(await fetchDrivers(administrator)));
    }
  }, [authenticated, administrator, dispatch]);

  useAsyncTask(async () => {
    if (authenticated) {
      dispatch(productsActions.refresh(await fetchProducts(administrator)));
    }
  }, [authenticated, administrator, dispatch]);

  useAsyncTask(
    async ({ signal }) => {
      if (authenticated) {
        const response = await fetchOrThrow('api/maintenance', { signal });
        dispatch(maintenancesActions.refresh(await response.json()));
      }
    },
    [authenticated, dispatch],
  );

  useAsyncTask(
    async ({ signal }) => {
      if (authenticated) {
        const response = await fetchOrThrow('api/calendars', { signal });
        dispatch(calendarsActions.refresh(await response.json()));
      }
    },
    [authenticated, dispatch],
  );

  return null;
};

export default CachingController;
