### TO START WITH

cp .env.example .env
yarn install
yarn prisma:generate
yarn prisma:migrate
npx prisma db seed

yarn docker:dev

The idea of the Data Access Control
./requirementSchema/permission_hierachy_simple.xlsx