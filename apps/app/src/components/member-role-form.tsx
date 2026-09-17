"use client";

import { useState } from "react";
import { PendingButton } from "./pending-button";

/** Role picker for a team member: Save only appears once the role differs from the saved one. */
export function MemberRoleForm({
  membershipId,
  role,
  name,
  action,
}: {
  membershipId: string;
  role: string;
  name: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [value, setValue] = useState(role);
  const changed = value !== role;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <select
        name="role"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-[112px] rounded-[7px] border border-line bg-white px-2 text-[12px] font-medium outline-none focus:border-ink"
        aria-label={`Role for ${name}`}
      >
        <option value="owner">Owner</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      <span className="w-[64px] shrink-0">
        {changed ? (
          <PendingButton className="btn btn-outline h-10 w-full px-3 text-[12px]" pendingLabel="Saving…">
            Save
          </PendingButton>
        ) : null}
      </span>
    </form>
  );
}
