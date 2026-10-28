import { cache } from "react";
import { songById, songRank } from "@/lib/db";

// Shared by the page, its metadata and its preview image, so each request asks the database once.
export const parseId = (raw: string) => (/^\d{1,9}$/.test(raw) ? Number(raw) : null);
export const getSong = cache((id: number) => songById(id));
export const getRank = cache((id: number, kind: "human" | "agent") => songRank(id, kind));
