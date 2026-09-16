import { EventSchemas, Inngest } from "inngest";

type Events = {
  "brief/submitted": {
    data: { orgId: string; briefId: string };
  };
  "concepts/generate": {
    data: { orgId: string; briefId: string; count?: number };
  };
};

export const inngest = new Inngest({
  id: "adcraft",
  schemas: new EventSchemas().fromRecord<Events>(),
});
