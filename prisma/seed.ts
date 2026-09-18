/**
 * Seed strategy (Doc 2 §D) — production-safe by default.
 *
 * Always seeds:
 *   1. One Organization (Forge)
 *   2. InvoiceSequence + CreditNoteSequence for current Indian FY
 *   3. TaxRate placeholder rows (REPLACE with accountant-verified HSN/SAC before prod)
 *   4. Users (one per role) — set real emails/password hashes before prod
 *
 * Demo CRM data ONLY when SEED_DEMO=1 — never against production.
 * Fake invoices must never touch a real FY sequence in production.
 */
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

function currentIndianFinancialYear(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based; April = 3
  if (month >= 3) {
    const start = year;
    const end = String(year + 1).slice(-2);
    return `${start}-${end}`;
  }
  const start = year - 1;
  const end = String(year).slice(-2);
  return `${start}-${end}`;
}

async function main() {
  const fy = currentIndianFinancialYear();

  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "FORGE",
      gstin: null, // set real GSTIN before production use
      billing_state: "Maharashtra",
      billing_address: "Pune, Maharashtra, India",
    },
  });

  await prisma.invoiceSequence.upsert({
    where: {
      organization_id_financial_year: {
        organization_id: org.id,
        financial_year: fy,
      },
    },
    update: {},
    create: {
      organization_id: org.id,
      financial_year: fy,
      last_number: 0,
    },
  });

  await prisma.creditNoteSequence.upsert({
    where: {
      organization_id_financial_year: {
        organization_id: org.id,
        financial_year: fy,
      },
    },
    update: {},
    create: {
      organization_id: org.id,
      financial_year: fy,
      last_number: 0,
    },
  });

  // PLACEHOLDER — verify HSN/SAC + rates with an accountant before production.
  const existingTax = await prisma.taxRate.findFirst({
    where: { organization_id: org.id, hsn_sac_code: "998314" },
  });
  if (!existingTax) {
    await prisma.taxRate.create({
      data: {
        organization_id: org.id,
        hsn_sac_code: "998314",
        description: "IT design and development services (VERIFY BEFORE PROD)",
        cgst_rate: 9,
        sgst_rate: 9,
        igst_rate: 18,
        effective_from: new Date(`${fy.split("-")[0]}-04-01`),
        effective_to: null,
      },
    });
  }

  const users: { email: string; name: string; role: UserRole }[] = [
    { email: "atharva.vavhal@forgebuilds.in", name: "Atharva Vavhal", role: UserRole.FOUNDER_ADMIN },
    { email: "atharv.jadhav@forgebuilds.in", name: "Atharva Jadhav", role: UserRole.TEAM_MEMBER },
    { email: "harshad.gat@forgebuilds.in", name: "Harshad Gat", role: UserRole.TEAM_MEMBER },
    { email: "shrikant.salunkhe@forgebuilds.in", name: "Shrikant Salunkhe", role: UserRole.TEAM_MEMBER },
    { email: "sharwari.patil@forgebuilds.in", name: "Sharwari Patil", role: UserRole.TEAM_MEMBER },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: {
        organization_id_email: {
          organization_id: org.id,
          email: u.email,
        },
      },
      update: { name: u.name, role: u.role },
      create: {
        organization_id: org.id,
        email: u.email,
        name: u.name,
        role: u.role,
        password_hash: null,
        active: true,
      },
    });
  }

  if (process.env.SEED_DEMO === "1") {
    const company = await prisma.company.create({
      data: {
        organization_id: org.id,
        name: "Demo Gym Co",
        billing_state: "Maharashtra",
        billing_address: "Pune",
        tags: ["demo"],
      },
    });
    await prisma.contact.create({
      data: {
        organization_id: org.id,
        company_id: company.id,
        name: "Demo Contact",
        email: "owner@demo-gym.local",
        phone: "+910000000000",
      },
    });
    console.log("Demo CRM rows created (SEED_DEMO=1).");
  }

  console.log(`Seeded Organization ${org.id}, FY ${fy} sequences, tax placeholder, users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
