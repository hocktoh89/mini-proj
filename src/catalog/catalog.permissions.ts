// Permission codes (rows in `permissions`, granted to roles via `rolePermissions`).
export const CATALOG_READ = 'catalog.read';
// Sees every row regardless of hierarchy; the user's own DENY overrides still apply.
export const CATALOG_ROWS_ALL = 'catalog.rows.all';
export const API_CLIENTS_MANAGE = 'apiClients.manage';
// Deduct stock (products.stockQty), e.g. when an order is placed.
export const CATALOG_STOCK_UPDATE = 'catalog.stock.update';
