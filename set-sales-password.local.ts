import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const password = randomBytes(9).toString("base64url");
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: {
      organization_id_email: {
        organization_id: "00000000-0000-4000-8000-000000000001",
        email: "sales@forge.local",
      },
    },
    data: { password_hash: hash },
  });

  console.log("Updated user:", user.email, user.role);
  console.log("PASSWORD:", password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
