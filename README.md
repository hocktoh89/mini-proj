### TO START WITH

cp .env.example .env
yarn install
yarn prisma:generate
yarn prisma:migrate
npx prisma db seed

yarn docker:dev

there are 2 swagger ERP at localhost:3006/api the 2 endpoints for order creation and SKU searcher at localhost:3010/api. get the bearer token from 3006 and use at 3010

test user admin@example.com ChangeMe123!

The idea of the Data Access Control
./requirementSchema/permission_hierachy_simple.xlsx