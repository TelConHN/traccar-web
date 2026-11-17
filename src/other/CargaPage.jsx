import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Collapse,
  Container,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '../common/components/LocalizationProvider';
import BackIcon from '../common/components/BackIcon';
import useCarga from '../common/util/useCarga';
import { useRestriction } from '../common/util/permissions';

// Qué lleva un vehículo, completo. Es una pantalla aparte y no una ventana sobre el mapa: con decenas
// de productos una ventana no se desplaza bien en el teléfono y el botón «atrás» la cierra sin querer.
// Acá «atrás» vuelve al mapa, se busca, y cada categoría se pliega.
const CargaPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const soloLectura = useRestriction('readonly');
  const { deviceId } = useParams();
  const id = Number(deviceId);

  const device = useSelector((state) => state.devices.items[id]);
  const { productos, cargando } = useCarga(id);

  const [buscado, setBuscado] = useState('');
  const [cerradas, setCerradas] = useState(() => new Set());

  const sinCategoria = t('productNoCategory');
  const sinRegistrar = t('productUnregistered');

  const grupos = useMemo(() => {
    const filtro = buscado.trim().toLowerCase();
    const mapa = new Map();
    productos
      .filter(
        (p) =>
          !filtro ||
          [p.nombre, p.codigo, p.categoria].some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(filtro),
          ),
      )
      .forEach((p) => {
        const grupo = p.registrado ? p.categoria || sinCategoria : sinRegistrar;
        if (!mapa.has(grupo)) mapa.set(grupo, []);
        mapa.get(grupo).push(p);
      });
    // Lo que no está registrado va al final: es lo que hay que revisar, no lo que se busca primero.
    return [...mapa.entries()]
      .map(([nombre, items]) => [
        nombre,
        items.sort((a, b) => (a.nombre ?? a.codigo).localeCompare(b.nombre ?? b.codigo)),
      ])
      .sort((a, b) =>
        a[0] === sinRegistrar ? 1 : b[0] === sinRegistrar ? -1 : a[0].localeCompare(b[0]),
      );
  }, [productos, buscado, sinCategoria, sinRegistrar]);

  const alternar = (nombre) =>
    setCerradas((antes) => {
      const nuevas = new Set(antes);
      if (nuevas.has(nombre)) nuevas.delete(nombre);
      else nuevas.add(nombre);
      return nuevas;
    });

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="inherit">
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            sx={{ mr: 2 }}
            onClick={() => navigate(-1)}
            aria-label="Volver"
          >
            <BackIcon />
          </IconButton>
          <Typography variant="h6" noWrap>
            {device?.name}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <Container maxWidth="sm" sx={{ py: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t('productLoad')}
              </Typography>
              <Typography variant="h5" component="p" fontWeight={700}>
                {cargando && productos.length === 0 ? (
                  <Skeleton width={180} />
                ) : productos.length === 0 ? (
                  t('productNone')
                ) : (
                  `${productos.length} ${t('sharedProducts').toLowerCase()}`
                )}
              </Typography>
            </Box>

            {productos.length > 5 && (
              <TextField
                value={buscado}
                onChange={(e) => setBuscado(e.target.value)}
                placeholder={t('productSearch')}
                slotProps={{
                  htmlInput: { 'aria-label': t('productSearch') },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}

            {grupos.map(([nombre, items]) => {
              const abierta = !cerradas.has(nombre) || Boolean(buscado.trim());
              return (
                <Paper key={nombre} variant="outlined">
                  <ListItemButton
                    onClick={() => alternar(nombre)}
                    aria-expanded={abierta}
                    sx={{ minHeight: 52 }}
                  >
                    <ListItemText primary={nombre} slotProps={{ primary: { fontWeight: 600 } }} />
                    <Typography color="text.secondary" sx={{ mr: 1 }}>
                      {items.length}
                    </Typography>
                    {abierta ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </ListItemButton>
                  <Collapse in={abierta}>
                    <List disablePadding>
                      {items.map((p) => (
                        <ListItem key={p.clave} divider sx={{ minHeight: 48 }}>
                          <ListItemText
                            primary={p.nombre ?? p.codigo}
                            secondary={p.nombre ? p.codigo : null}
                            slotProps={{ secondary: { sx: { wordBreak: 'break-all' } } }}
                          />
                          {p.aMano && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={t('productLinkedByHand')}
                            />
                          )}
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </Paper>
              );
            })}

            {!soloLectura && grupos.some(([nombre]) => nombre === sinRegistrar) && (
              <Button variant="outlined" onClick={() => navigate('/settings/product')}>
                {`+ ${t('sharedProduct')}`}
              </Button>
            )}
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

export default CargaPage;
