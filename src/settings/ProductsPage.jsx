import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import AddFab from './components/AddFab';
import CollectionActions from './components/CollectionActions';
import TableShimmer from '../common/components/TableShimmer';
import SearchHeader from './components/SearchHeader';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import ProductosAyuda from './components/ProductosAyuda';

// Ajustes → Productos: la misma pantalla que Conductores, pensada para catálogos de decenas o cientos.
// Se trae el catálogo entero y se filtra acá: así el buscador y las categorías responden al instante
// (con 50 productos, recorrer páginas para encontrar uno era lo que más molestaba).
const ProductsPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const theme = useTheme();
  const telefono = useMediaQuery(theme.breakpoints.down('md'));

  const [timestamp, setTimestamp] = useState(() => Date.now());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoria, setCategoria] = useState(null);

  useEffectAsync(async () => {
    setLoading(true);
    try {
      const response = await fetchOrThrow('/api/products');
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  }, [timestamp]);

  const sinCategoria = t('productNoCategory');
  const categorias = useMemo(() => {
    const cuenta = new Map();
    items.forEach((it) => {
      const c = it.category || sinCategoria;
      cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    });
    return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, sinCategoria]);

  const visibles = useMemo(() => {
    const buscado = keyword.trim().toLowerCase();
    return items.filter(
      (it) =>
        (!categoria || (it.category || sinCategoria) === categoria) &&
        (!buscado ||
          [it.name, it.uniqueId, it.category].some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(buscado),
          )),
    );
  }, [items, keyword, categoria, sinCategoria]);

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'sharedProducts']}>
      <ProductosAyuda sx={{ px: 2, pt: 2, display: 'flex', justifyContent: 'flex-end' }} />
      <SearchHeader keyword={keyword} setKeyword={setKeyword} />
      {categorias.length > 1 && (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ px: 2, pb: 2 }}
          role="group"
          aria-label={t('productCategory')}
        >
          <Chip
            label={`${t('productAllCategories')} · ${items.length}`}
            color={categoria ? 'default' : 'primary'}
            variant={categoria ? 'outlined' : 'filled'}
            onClick={() => setCategoria(null)}
          />
          {categorias.map(([nombre, cuenta]) => (
            <Chip
              key={nombre}
              label={`${nombre} · ${cuenta}`}
              color={categoria === nombre ? 'primary' : 'default'}
              variant={categoria === nombre ? 'filled' : 'outlined'}
              onClick={() => setCategoria(categoria === nombre ? null : nombre)}
            />
          ))}
        </Stack>
      )}
      <Table className={classes.table}>
        <TableHead>
          <TableRow>
            <TableCell>{t('sharedName')}</TableCell>
            <TableCell>{t('productCode')}</TableCell>
            {!telefono && <TableCell>{t('productCategory')}</TableCell>}
            <TableCell className={classes.columnAction} />
          </TableRow>
        </TableHead>
        <TableBody>
          {!loading &&
            visibles.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {item.name}
                  {telefono && item.category && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {item.category}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ wordBreak: 'break-all' }}>{item.uniqueId}</TableCell>
                {!telefono && <TableCell>{item.category || '—'}</TableCell>}
                <TableCell className={classes.columnAction} padding="none">
                  <CollectionActions
                    itemId={item.id}
                    editPath="/settings/product"
                    endpoint="products"
                    onReload={() => setTimestamp(Date.now())}
                  />
                </TableCell>
              </TableRow>
            ))}
          {loading && <TableShimmer columns={telefono ? 3 : 4} endAction />}
        </TableBody>
      </Table>
      {!loading && visibles.length === 0 && (
        <Box sx={{ p: 3 }}>
          <Typography color="text.secondary">{t('sharedNoData')}</Typography>
        </Box>
      )}
      <AddFab editPath="/settings/product" />
    </PageLayout>
  );
};

export default ProductsPage;
