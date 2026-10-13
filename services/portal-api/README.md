# Portal API

The customer-facing "Product Availability" API from the take-home task (Part 1). It runs in its own
container and calls the ERP (the mini-proj backend at the repo root) over HTTP, as it would a
third-party service.

| Endpoint              | ERP call(s)                                                  |
| --------------------- | ------------------------------------------------------------ |
| `GET /products/:sku`  | `GET /products/sku/:sku`                                     |
| `POST /orders`        | `GET /auth/me`, then per item `GET /products/availability/:sku/qty/:qty`, then per item `PATCH /products/:sku/stock` |

`POST /orders` takes several items:

```json
{ "items": [{ "sku": "SKU-1001", "qty": 2 }, { "sku": "SKU-1004", "qty": 1 }] }
```

1. **Check** every item's availability on the ERP. If any item is over stock (409), hidden or
   unknown (404), the whole order is rejected and no stock is touched.
2. **Deduct** every item's stock on the ERP. Each deduction is one conditional `UPDATE`, so it can't
   oversell even if stock changed after the check.
3. **Save** the order and its items (`orders` / `order_items` in the `portal` schema).

Repeated SKUs are merged, so availability is checked against the total quantity.

## Flow: log in on the ERP, then call the portal

1. `POST /auth/login` on the ERP (`localhost:3006`) returns an `accessToken`.
2. Send it to the portal as `Authorization: Bearer <accessToken>`.
3. The portal forwards the token to the ERP on every call. It has no credentials or permission rules
   of its own. The ERP works out who you are from the token and applies your role and hierarchy
   from its DB:
   - **permissions**: `catalog.read` to look up products, `catalog.stock.update` to order
   - **row access**: hierarchy nodes and allow/deny overrides (a hidden SKU returns 404, the same
     as a missing one)
   - **field access**: hidden columns (e.g. `cost`, or `stockQty`) are left out of the response

Requests without a Bearer token get 401 from the portal before anything reaches the ERP.

ERP 4xx responses are passed through with the same status and body. ERP 5xx responses and
network errors become 502.

## Run

With the rest of the stack, from the repo root:

```bash
docker compose up --build            # portal on http://localhost:3010, Swagger at /api
```

On the host: copy `.env.example` to `.env`, then `yarn && yarn prisma generate && yarn prisma migrate deploy && yarn start:dev`.

## Demo

```bash
# 1. log in to the ERP
TOKEN=$(curl -s localhost:3006/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}' \
  | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).accessToken))')

# 2. call the portal with that token
curl localhost:3010/products/SKU-1001 -H "authorization: Bearer $TOKEN"
curl localhost:3010/orders -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"items":[{"sku":"SKU-1001","qty":1},{"sku":"SKU-1004","qty":1}]}'      # 201
curl localhost:3010/orders -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"items":[{"sku":"SKU-1001","qty":1},{"sku":"SKU-1004","qty":99999}]}'  # 409, nothing deducted
```
