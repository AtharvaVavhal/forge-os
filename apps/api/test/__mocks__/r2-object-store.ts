/** Shared in-memory R2 object map for test mocks (never touches a real bucket). */
export type StoredObject = {
  sizeBytes: number;
  mimeType: string;
};

export const mockR2Objects = new Map<string, StoredObject>();

export function resetMockR2Objects(): void {
  mockR2Objects.clear();
}
