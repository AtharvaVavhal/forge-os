import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma.module";
import { TeamModule } from "../team/team.module";
import { ProjectAllocationsController } from "./controllers/project-allocations.controller";
import { PayoutsController } from "./controllers/payouts.controller";
import { TeamEarningsController } from "./controllers/team-earnings.controller";
import { TeamPayoutsController } from "./controllers/team-payouts.controller";
import { ProjectFinancialsService } from "./services/project-financials.service";
import { EarningsBalanceService } from "./services/earnings-balance.service";
import { ProjectAllocationsService } from "./services/project-allocations.service";
import { TeamPayoutsService } from "./services/team-payouts.service";
import { TeamEarningsService } from "./services/team-earnings.service";

/**
 * K11/K12 — Project revenue allocation to team members and their
 * withdrawal pipeline. Deliberately its own top-level module (not folded
 * into `finance` or `team`): it owns three new tables (ProjectAllocation,
 * ProjectAllocationLine, TeamPayoutRequest) and serves both planes —
 * Finance review (`/project-allocations*`, `/payouts*`) and member
 * self-service (`/team/earnings*`, `/team/payouts*`) — so it doesn't
 * belong exclusively to either existing module. Imports `TeamModule` for
 * `TeamOnboardingGateService` — `TeamEarningsService.createPayoutRequest`
 * calls its `assertKycVerifiedForWithdrawal` (Phase 3 of the K5 onboarding
 * redesign: KYC is required at first withdrawal, not at onboarding).
 */
@Module({
  imports: [PrismaModule, TeamModule],
  controllers: [ProjectAllocationsController, PayoutsController, TeamEarningsController, TeamPayoutsController],
  providers: [
    ProjectFinancialsService,
    EarningsBalanceService,
    ProjectAllocationsService,
    TeamPayoutsService,
    TeamEarningsService,
  ],
  exports: [EarningsBalanceService],
})
export class EarningsModule {}
