import { EventSchemas, Inngest } from "inngest";
import type { JobPayloads } from "@/server/jobs";

type Events = {
  "concepts/generate": { data: JobPayloads["concepts.generate"] };
  "static/generate": { data: JobPayloads["static.generate"] };
  "product/cutout": { data: JobPayloads["product.cutout"] };
  "render/variants": { data: JobPayloads["render.variants"] };
};

export const inngest = new Inngest({
  id: "adcraft",
  schemas: new EventSchemas().fromRecord<Events>(),
});
