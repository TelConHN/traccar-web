import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useMediaQuery, useTheme } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import BottomMenu from './common/components/BottomMenu';
import SocketController from './SocketController';
import CachingController from './CachingController';
import { useEffect } from 'react';
import { useCatch, useEffectAsync } from './reactHelper';
import { sessionActions } from './store';
import UpdateController from './UpdateController';
import MotionController from './main/MotionController';
import TermsDialog from './common/components/TermsDialog';
import Loader from './common/components/Loader';
import fetchOrThrow from './common/util/fetchOrThrow';

const useStyles = makeStyles()(() => ({
  page: {
    flexGrow: 1,
    overflow: 'auto',
  },
  menu: {
    zIndex: 4,
    '@media print': {
      display: 'none',
    },
  },
}));

const App = () => {
  const { classes } = useStyles();
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const newServer = useSelector((state) => state.session.server.newServer);
  const termsUrl = useSelector((state) => state.session.server.attributes.termsUrl);
  const user = useSelector((state) => state.session.user);

  const acceptTerms = useCatch(async () => {
    const response = await fetchOrThrow(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, attributes: { ...user.attributes, termsAccepted: true } }),
    });
    dispatch(sessionActions.updateUser(await response.json()));
  });

  useEffectAsync(async () => {
    if (!user) {
      const response = await fetch('/api/session');
      if (response.ok) {
        dispatch(sessionActions.updateUser(await response.json()));
      } else {
        window.sessionStorage.setItem('postLogin', pathname + search);
        navigate(newServer ? '/register' : '/login', { replace: true });
      }
    }
    return null;
  }, []);

  // Un conductor entra a trabajar, no a mirar la flota: se le lleva a su ruta. Sin esto caía
  // en el mapa principal, que para él está vacío —solo ve el vehículo de su ruta activa— y
  // tenía que descubrir solo dónde estaba lo suyo.
  //
  // El rol viaja en su propia cuenta, así que esto no cuesta ninguna consulta. Solo redirige
  // desde la raíz: si abre un enlace concreto, se respeta.
  useEffect(() => {
    if (user?.attributes?.['rutas.rol'] === 'conductor' && pathname === '/') {
      navigate('/mi-ruta', { replace: true });
    }
  }, [user, pathname, navigate]);

  if (user == null) {
    return <Loader />;
  }
  if (termsUrl && !user.attributes.termsAccepted) {
    return <TermsDialog open onCancel={() => navigate('/login')} onAccept={() => acceptTerms()} />;
  }
  return (
    <>
      <SocketController />
      <CachingController />
      <UpdateController />
      <MotionController />
      <div className={classes.page}>
        <Outlet />
      </div>
      {!desktop && (
        <div className={classes.menu}>
          <BottomMenu />
        </div>
      )}
    </>
  );
};

export default App;
