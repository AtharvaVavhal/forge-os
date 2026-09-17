export const authQueryKeys = {
  all: ["auth"] as const,
  me: ["auth", "me"] as const,
  session: ["auth", "session"] as const,
  permissions: ["auth", "permissions"] as const,
};
