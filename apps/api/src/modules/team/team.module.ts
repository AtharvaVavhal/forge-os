import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma.module";
import { TeamController } from "./controllers/team.controller";
import { TeamService } from "./services/team.service";

@Module({
  imports: [PrismaModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
