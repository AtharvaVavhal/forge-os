import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma.module";
import { TeamController } from "./controllers/team.controller";
import { KycController } from "./controllers/kyc.controller";
import { KycDocumentsController } from "./controllers/kyc-documents.controller";
import { PayoutProfileController } from "./controllers/payout-profile.controller";
import { TeamService } from "./services/team.service";
import { KycService } from "./services/kyc.service";
import { KycDocumentsService } from "./services/kyc-documents.service";
import { PayoutProfileService } from "./services/payout-profile.service";
import { TeamOnboardingGateService } from "./services/team-onboarding-gate.service";

@Module({
  imports: [PrismaModule],
  controllers: [
    TeamController,
    KycController,
    KycDocumentsController,
    PayoutProfileController,
  ],
  providers: [
    TeamService,
    KycService,
    KycDocumentsService,
    PayoutProfileService,
    TeamOnboardingGateService,
  ],
  exports: [
    TeamService,
    KycService,
    KycDocumentsService,
    PayoutProfileService,
    TeamOnboardingGateService,
  ],
})
export class TeamModule {}
