const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.whatsAppNumber.findFirst().then(n => console.log(n.accessToken)).finally(() => prisma.$disconnect());
