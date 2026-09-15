// Transporte: supervisión de recorridos fijos para cualquier cliente — escuelas, empresas que
// llevan a su personal, rutas públicas, turismo.
//
// Es otro servicio que Rutas —otro ícono, otro menú, otras palabras— aunque por dentro comparta la
// sesión y el servidor. Cada sección tiene su propia dirección (`/transporte/recorridos`, …) y
// la página decide qué mostrar leyendo esa dirección, igual que el menú de la izquierda.
//
// El recorrido de quien entra por primera vez:
//   1. ¿Qué transporte manejás? — una sola pregunta, con cuatro tarjetas.
//   2. Primeros pasos — con las palabras de su operación («estudiantes», «colaboradores»…).
// Nunca una pantalla vacía: quien entra tiene que saber qué hacer primero, no adivinarlo.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import ConstructionIcon from '@mui/icons-material/Construction';
import SchoolIcon from '@mui/icons-material/School';
import FactoryIcon from '@mui/icons-material/Factory';
import DepartureBoardIcon from '@mui/icons-material/DepartureBoard';
import LuggageIcon from '@mui/icons-material/Luggage';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PageLayout from '../common/components/PageLayout';
import { useEffectAsync } from '../reactHelper';
import TransporteMenu from './TransporteMenu';
import transporteApi from './api';
import { OPERACIONES, ORDEN_OPERACIONES } from './operaciones';
import { existeSeccion, rutaDe, seccionDe, seccionesVisibles } from './secciones';

const ICONO_OPERACION = {
  escolar: <SchoolIcon />,
  personal: <FactoryIcon />,
  linea: <DepartureBoardIcon />,
  otro: <LuggageIcon />,
};

/// La única pregunta antes de empezar. Se elige una tarjeta y se confirma con un botón: tocar una
/// tarjeta por error no puede cambiarle las pantallas a toda la cuenta.
const EleccionOperacion = ({ actual, onGuardada, esCambio }) => {
  const [elegida, setElegida] = useState(actual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const { operacion } = await transporteApi.configurar(elegida);
      onGuardada(operacion);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 820 }}>
      <Typography variant="h5" component="h1" fontWeight={600}>
        {esCambio ? 'Tipo de transporte' : '¿Qué transporte manejás?'}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
        {esCambio
          ? 'Cambiarlo cambia las palabras y las secciones para toda la cuenta. Tus recorridos y horarios no se tocan.'
          : 'Así te mostramos las palabras y los pasos que te sirven. Lo podés cambiar después en Configuración.'}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        {ORDEN_OPERACIONES.map((clave) => {
          const op = OPERACIONES[clave];
          const seleccionada = elegida === clave;
          return (
            <Card
              key={clave}
              variant="outlined"
              sx={{
                borderWidth: 2,
                borderColor: seleccionada ? 'primary.main' : 'divider',
              }}
            >
              <CardActionArea
                onClick={() => setElegida(clave)}
                aria-pressed={seleccionada}
                sx={{ p: 2, height: '100%', alignItems: 'flex-start' }}
              >
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Avatar
                    sx={{
                      bgcolor: seleccionada ? 'primary.main' : 'action.selected',
                      color: seleccionada ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    {ICONO_OPERACION[clave]}
                  </Avatar>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography fontWeight={600}>{op.nombre}</Typography>
                      {seleccionada && <CheckCircleIcon color="primary" fontSize="small" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      {op.resumen}
                    </Typography>
                  </Box>
                </Stack>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5 }}>
        <Button
          variant="contained"
          disabled={!elegida || elegida === actual || guardando}
          onClick={guardar}
        >
          {esCambio ? 'Guardar cambio' : 'Continuar'}
        </Button>
        {!elegida && (
          <Typography variant="body2" color="text.secondary">
            Elegí una opción para seguir.
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

const PrimerosPasos = ({ perfil }) => {
  const navigate = useNavigate();
  const op = OPERACIONES[perfil.operacion];
  const buses = perfil.vehiculos;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 760 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
          <DirectionsBusIcon />
        </Avatar>
        <div>
          <Typography variant="overline" color="text.secondary" lineHeight={1.4}>
            {op.nombre}
          </Typography>
          <Typography variant="h5" component="h1" fontWeight={600}>
            Empecemos por tu primer recorrido
          </Typography>
        </div>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        En {op.pasos.length} pasos {op.promesa}
      </Typography>

      {/* Los buses con el servicio, con nombre: confirma que el contrato quedó bien antes de
          empezar a armar nada, y evita el «¿y dónde está mi bus?» del primer día. */}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {buses.length === 1 ? '1 bus con el servicio:' : `${buses.length} buses con el servicio:`}
        </Typography>
        {buses.map((b) => (
          <Chip key={b.id} size="small" icon={<DirectionsBusIcon />} label={b.nombre} />
        ))}
      </Stack>

      <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {op.pasos.map((paso, i) => {
          const destino = seccionesVisibles(perfil.operacion)
            .flat()
            .find((s) => s.clave === paso.seccion);
          return (
            <Paper key={paso.titulo} component="li" variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    // El primero es el que toca: los demás esperan su turno sin gritar.
                    bgcolor: i === 0 ? 'primary.main' : 'action.selected',
                    color: i === 0 ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  {i + 1}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={600}>{paso.titulo}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {paso.detalle}
                  </Typography>
                  <Button
                    size="small"
                    variant={i === 0 ? 'contained' : 'text'}
                    sx={{ mt: 1.5, ml: i === 0 ? 0 : -0.75 }}
                    onClick={() => navigate(rutaDe(paso.seccion))}
                  >
                    Ir a {destino?.titulo ?? 'la sección'}
                  </Button>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
};

/// Una sección que todavía no tiene contenido dice qué va a haber ahí, en vez de mostrar una tabla
/// sin filas.
const SeccionVacia = ({ seccion }) => (
  <Stack
    alignItems="center"
    textAlign="center"
    spacing={1.5}
    sx={{ p: 4, maxWidth: 520, mx: 'auto', mt: 4 }}
  >
    <Avatar sx={{ width: 56, height: 56, bgcolor: 'action.selected', color: 'text.secondary' }}>
      <ConstructionIcon />
    </Avatar>
    <Typography variant="h6" component="h1">
      {seccion.titulo}
    </Typography>
    <Typography color="text.secondary">{seccion.descripcion}</Typography>
    <Chip size="small" label="En construcción" variant="outlined" />
  </Stack>
);

const TransportePage = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');

  useEffectAsync(async () => {
    try {
      setPerfil(await transporteApi.perfil());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const operacion = perfil?.operacion ?? null;
  const pedida = seccionDe(pathname);
  // Con el título en las palabras de la cuenta («Estudiantes», «Colaboradores»…).
  const seccion =
    seccionesVisibles(operacion)
      .flat()
      .find((s) => s.clave === pedida.clave) ?? pedida;
  const sinServicio = perfil && perfil.vehiculos.length === 0;

  // A «Hoy» cuando la sección pedida no existe para esta cuenta —una ruta pública que llega a
  // «Pasajeros» por un enlace copiado— o cuando todavía falta elegir el tipo de operación. Se
  // cambia la dirección y no solo lo que se dibuja, para que el menú marque dónde está.
  useEffect(() => {
    if (!perfil || pedida.clave === 'hoy') return;
    if (!operacion || !existeSeccion(pedida, operacion)) {
      navigate('/transporte', { replace: true });
    }
  }, [perfil, operacion, pedida, navigate]);

  const guardada = (nueva) => setPerfil((p) => ({ ...p, operacion: nueva }));

  let contenido = null;
  if (perfil && !sinServicio) {
    if (!operacion) {
      contenido = perfil.configura ? (
        <EleccionOperacion actual={null} onGuardada={guardada} />
      ) : (
        <Alert severity="info" sx={{ m: 2 }}>
          Tu cuenta todavía no terminó de configurar Transporte. Cuando lo haga, acá vas a ver tus
          recorridos.
        </Alert>
      );
    } else if (pedida.clave === 'hoy') {
      contenido = <PrimerosPasos perfil={perfil} />;
    } else if (pedida.clave === 'configuracion' && perfil.configura) {
      contenido = (
        <EleccionOperacion key={operacion} actual={operacion} onGuardada={guardada} esCambio />
      );
    } else {
      contenido = <SeccionVacia seccion={seccion} />;
    }
  }

  return (
    <PageLayout
      menu={<TransporteMenu operacion={operacion} />}
      breadcrumbs={pedida.clave === 'hoy' ? ['Transporte'] : ['Transporte', seccion.titulo]}
    >
      {!perfil && !error && <LinearProgress />}
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}
      {sinServicio && (
        <Alert severity="info" sx={{ m: 2 }}>
          Ninguno de tus vehículos tiene contratado el servicio de Transporte. Escribinos para
          activarlo.
        </Alert>
      )}
      {contenido}
    </PageLayout>
  );
};

export default TransportePage;
