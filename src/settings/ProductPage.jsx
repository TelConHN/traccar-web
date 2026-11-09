import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditItemView from './components/EditItemView';
import EditAttributesAccordion from './components/EditAttributesAccordion';
import { useTranslation } from '../common/components/LocalizationProvider';
import SettingsMenu from './components/SettingsMenu';
import useSettingsStyles from './common/useSettingsStyles';
import { productsActions } from '../store';
import { useAdministrator } from '../common/util/permissions';
import fetchProducts from '../common/util/fetchProducts';
import ProductosAyuda from './components/ProductosAyuda';

// Un producto: nombre, el código que manda el lector y una categoría para agruparlo. Igual que un
// conductor. Cómo se lee el código en el GPS es cosa del técnico: el botón «Cómo funciona» lo ven
// solo los administradores; el cliente solo carga sus productos.
const ProductPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const dispatch = useDispatch();
  const administrator = useAdministrator();

  const catalogo = useSelector((state) => state.products.items);
  const categorias = useMemo(
    () =>
      [
        ...new Set(
          Object.values(catalogo)
            .map((it) => it.category)
            .filter(Boolean),
        ),
      ].sort(),
    [catalogo],
  );

  const [item, setItem] = useState();

  // Como con los conductores: sin refrescar, el nombre recién puesto no aparecía en el mapa (seguía
  // el código) hasta recargar la página.
  const onItemSaved = async () => {
    dispatch(productsActions.refresh(await fetchProducts(administrator)));
  };

  const validate = () => item && item.name && item.uniqueId;

  return (
    <EditItemView
      endpoint="products"
      item={item}
      setItem={setItem}
      validate={validate}
      onItemSaved={onItemSaved}
      menu={<SettingsMenu />}
      breadcrumbs={['settingsTitle', 'sharedProduct']}
    >
      {item && (
        <>
          <ProductosAyuda sx={{ px: 2, pt: 2 }} />
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t('sharedRequired')}</Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                value={item.name || ''}
                onChange={(event) => setItem({ ...item, name: event.target.value })}
                label={t('sharedName')}
              />
              <TextField
                value={item.uniqueId || ''}
                onChange={(event) => setItem({ ...item, uniqueId: event.target.value })}
                label={t('productCode')}
              />
              <Autocomplete
                freeSolo
                options={categorias}
                value={item.category || ''}
                onInputChange={(_, value) => setItem({ ...item, category: value })}
                renderInput={(params) => <TextField {...params} label={t('productCategory')} />}
              />
            </AccordionDetails>
          </Accordion>
          <EditAttributesAccordion
            attributes={item.attributes}
            setAttributes={(attributes) => setItem({ ...item, attributes })}
            definitions={{}}
          />
        </>
      )}
    </EditItemView>
  );
};

export default ProductPage;
