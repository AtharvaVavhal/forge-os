import { z } from "zod";
import { DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, VISIBILITIES } from "../api/types";

export const documentUploadSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  visibility: z.enum(VISIBILITIES),
  file: z
    .custom<File>((value) => value instanceof File && value.size > 0, "Choose a file.")
    .refine((file) => file.size <= MAX_DOCUMENT_BYTES, "Files larger than 25MB are not accepted."),
});
