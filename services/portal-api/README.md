# Portal API

The customer-facing "Product Availability" API from the take-home task (Part 1). It runs in its own
container and calls the ERP (the mini-proj backend at the repo root) over HTTP, as it would a
third-party service.

| Endpoint              | ERP call(s)                                   |
| --------------------- | --------------------------------------------- |
| `GET /products/:sku`  | `GET /products/sku/:sku`                      |
| `POST /orders`        | `GET /auth/me`, then `PATCH /products/:sku/stock` |

`POST /orders` takes `{ "sku": "SKU-1001", "quantity": 2 }`. The ERP deducts stock in one
conditional `UPDATE`, so an order larger than the stock is rejected with **409 Conflict** and
concurrent orders can't oversell. The order is saved (in the `portal` schema) only after the
deduction succeeds.

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
  -d '{"sku":"SKU-1001","quantity":1}'          # 201
curl localhost:3010/orders -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"sku":"SKU-1001","quantity":99999}'      # 409
```
