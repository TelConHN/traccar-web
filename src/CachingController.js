import { useDispatch, useSelector, connect } from 'react-redux';
import {
  geofencesActions,
  groupsActions,
  driversActions,
  maintenancesActions,
  calendarsActions,
} from './store';
import { useEffectAsync } from './reactHelper';
import fetchOrThrow from './common/util/fetchOrThrow';
import fetchDrivers from './common/util/fetchDrivers';

const CachingController = () => {
  const authenticated = useSelector((state) => !!state.session.user);
  const administrator = useSelector((state) => !!state.session.user?.administrator);
  const dispatch = useDispatch();

  useEffectAsync(async () => {
    if (authenticated) {
      const response = await fetchOrThrow('/api/geofences');
      dispatch(geofencesActions.refresh(await response.json()));
    }
  }, [authenticated]);

  useEffectAsync(async () => {
    if (authenticated) {
      const response = await fetchOrThrow('/api/groups');
      dispatch(groupsActions.refresh(await response.json()));
    }
  }, [authenticated]);

  useEffectAsync(async () => {
    if (authenticated) {
      dispatch(driversActions.refresh(await fetchDrivers(administrator)));
    }
  }, [authenticated, administrator]);

  useEffectAsync(async () => {
    if (authenticated) {
      const response = await fetchOrThrow('/api/maintenance');
      dispatch(maintenancesActions.refresh(await response.json()));
    }
  }, [authenticated]);

  useEffectAsync(async () => {
    if (authenticated) {
      const response = await fetchOrThrow('/api/calendars');
      dispatch(calendarsActions.refresh(await response.json()));
    }
  }, [authenticated]);

  return null;
};

export default connect()(CachingController);
