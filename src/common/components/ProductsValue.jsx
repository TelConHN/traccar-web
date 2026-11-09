import { useSelector } from 'react-redux';
import { buscarProducto } from '../util/useCarga';

// El atributo «products» de una posición con nombres en vez de códigos: los 3 primeros y cuántos más.
// La lista completa está en «Ver carga».
const ProductsValue = ({ value }) => {
  const catalogo = useSelector((state) => state.products.items);
  const nombres = String(value ?? '')
    .split(',')
    .filter(Boolean)
    .map((codigo) => buscarProducto(catalogo, codigo)?.name ?? codigo);
  if (nombres.length <= 3) return nombres.join(', ');
  return `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más`;
};

export default ProductsValue;
