const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ log: ['error', 'warn'] });
const timer = setTimeout(() => {
  console.log('TIMEOUT: $connect() did not resolve within 20s');
  process.exit(2);
}, 20000);

prisma
  .$connect()
  .then(() => {
    clearTimeout(timer);
    console.log('CONNECT OK');
    return prisma.$disconnect();
  })
  .then(() => process.exit(0))
  .catch((error) => {
    clearTimeout(timer);
    console.log('CONNECT FAIL', error.errorCode ?? error.code);
    console.log(String(error.message).split('\n').slice(-2).join('\n'));
    process.exit(1);
  });
