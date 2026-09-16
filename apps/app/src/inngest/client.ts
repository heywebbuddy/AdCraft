import { EventSchemas, Inngest } from "inngest";
import type { JobPayloads } from "@/server/jobs";

type Events = {
  "concepts/generate": { data: JobPayloads["concepts.generate"] };
  "static/generate": { data: JobPayloads["static.generate"] };
  "product/cutout": { data: JobPayloads["product.cutout"] };
  "render/variants": { data: JobPayloads["render.variants"] };
  "video/generate": { data: JobPayloads["video.generate"] };
  "ugc/generate": { data: JobPayloads["ugc.generate"] };
  "publish/campaign": { data: JobPayloads["publish.campaign"] };
  "insights/sync": { data: JobPayloads["insights.sync"] };
};

export const inngest = new Inngest({
  id: "adcraft",
  schemas: new EventSchemas().fromRecord<Events>(),
});
