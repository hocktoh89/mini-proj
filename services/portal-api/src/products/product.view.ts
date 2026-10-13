import { ErpProduct } from '../vendor-erp/vendor-erp.service';

// The portal's product shape: the ERP's stockQty is exposed as stockQuantity. Fields the caller may
// not see are absent in the ERP response and stay absent here.
export function toProductView({ stockQty, ...rest }: ErpProduct) {
  return stockQty === undefined ? rest : { ...rest, stockQuantity: stockQty };
}
