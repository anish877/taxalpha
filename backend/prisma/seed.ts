import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const forms = [
  {
    code: 'INVESTOR_PROFILE',
    title: 'Investor-Profile'
  },
  {
    code: 'INVESTOR_PROFILE_ADDITIONAL_HOLDER',
    title: 'Investor-Profile-Additional-Holder'
  },
  {
    code: 'BAIODF',
    title: 'Brokerage Alternative Investment Order and Disclosure Form'
  },
  {
    code: 'BAIV_506C',
    title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506C'
  },
  {
    code: 'SFC',
    title: 'Statement of Financial Condition'
  }
] as const;

async function main() {
  for (const form of forms) {
    await prisma.formCatalog.upsert({
      where: { code: form.code },
      update: {
        title: form.title,
        active: true
      },
      create: {
        code: form.code,
        title: form.title,
        active: true
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
