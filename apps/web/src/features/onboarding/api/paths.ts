export const onboardingKycPaths = {
  kyc: "/team/kyc",
  submit: "/team/kyc/submit",
  documentsPresign: "/team/kyc/documents/presign-upload",
  documents: "/team/kyc/documents",
  documentDelete: (id: string) => `/team/kyc/documents/${id}/delete`,
  workProfile: "/team/work-profile",
  payoutProfile: "/team/payout-profile",
  upiQrPresign: "/team/payout-profile/upi-qr/presign-upload",
  upiQrRegister: "/team/payout-profile/upi-qr",
  upiQrDelete: "/team/payout-profile/upi-qr/delete",
} as const;
