export const onboardingQueryKeys = {
  all: ["onboarding"] as const,
  kyc: () => [...onboardingQueryKeys.all, "kyc"] as const,
  payout: () => [...onboardingQueryKeys.all, "payout"] as const,
};
