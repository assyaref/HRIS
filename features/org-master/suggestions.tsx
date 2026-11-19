import { isOrgMasterReady } from "./module";
import { listMasterSuggestions } from "./queries";

/**
 * <datalist> suggestions from the organization master for the employee
 * forms' Division / Department / Position inputs (`list="org-master-…"`).
 * Renders nothing before migration 0030. Inputs stay free text.
 */
export async function OrgMasterSuggestions({ organizationId }: { organizationId: string }) {
  if (!(await isOrgMasterReady())) return null;
  const { departments, positions, divisions } = await listMasterSuggestions(organizationId);
  return (
    <>
      <datalist id="org-master-divisions">
        {divisions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="org-master-departments">
        {departments.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="org-master-positions">
        {positions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  );
}
