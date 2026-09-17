import { z } from "zod";
import { VISIBILITIES } from "../api/types";

export const noteFormSchema = z.object({
  body: z.string().trim().min(1, "Enter a note."),
  visibility: z.enum(VISIBILITIES),
});
