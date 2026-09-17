import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import type { AppConfig } from "../../../config/configuration";

/**
 * bcrypt, not argon2: Document 6 §3 requires "strong password hashing"
 * without naming an algorithm. bcrypt remains a well-audited, industry-
 * standard choice; `bcryptjs` (pure JS, no native compilation) avoids the
 * node-gyp build fragility Phase 0 already saw from other native
 * dependencies in this environment, at the cost of being somewhat slower
 * than the native `bcrypt` package — an acceptable tradeoff at this
 * team's login volume (Document 1: 5-person studio).
 *
 * Cost factor 12 is a currently-reasonable default (~250ms/hash on modern
 * hardware) — Document 6 doesn't freeze a specific work factor, so this
 * is an implementation default, not a claimed frozen value, configurable
 * via `PASSWORD_HASH_COST_FACTOR` so it can be raised later without a
 * code change.
 */
@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get costFactor(): number {
    return this.config.get("auth.passwordHashCostFactor", { infer: true });
  }

  async hash(plaintext: string): Promise<string> {
    const salt = await bcrypt.genSalt(this.costFactor);
    return bcrypt.hash(plaintext, salt);
  }

  async verify(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
