/**
 * Auto-exclusion rules for bills
 * These rules determine which bills should be automatically excluded from margin calculations
 */

export interface BillExclusionRule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  field: "vendor_name" | "bill_number" | "account_name" | "description" | "notes" | "cf_expense_category" | "total";
  operator: "equals" | "contains" | "contains_any_of" | "starts_with" | "ends_with" | "greater_than" | "less_than";
  value: string | number;
  reason: string; // Reason to show when bill is excluded
  is_default?: boolean; // Optional flag for default rules
}

/**
 * Check if a bill should be excluded based on rules
 */
export function shouldExcludeBill(
  bill: {
    vendor_name?: string | null;
    bill_number?: string | null;
    account_name?: string | null;
    description?: string | null;
    notes?: string | null;
    cf_expense_category?: string | null;
    total?: number;
  },
  rules: BillExclusionRule[]
): { exclude: boolean; reason?: string } {
  const enabledRules = rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    const fieldValue = bill[rule.field];

    if (fieldValue === null || fieldValue === undefined) {
      continue;
    }

    let matches = false;

    switch (rule.operator) {
      case "equals":
        matches = String(fieldValue).toLowerCase() === String(rule.value).toLowerCase();
        break;

      case "contains":
        matches = String(fieldValue).toLowerCase().includes(String(rule.value).toLowerCase());
        break;

      case "contains_any_of": {
        // Parse value as JSON array for multiple values
        try {
          const values = typeof rule.value === 'string' ? JSON.parse(rule.value) : [rule.value];
          const fieldStr = String(fieldValue).toLowerCase();
          matches = values.some((val: string) => fieldStr.includes(String(val).toLowerCase()));
        } catch (e) {
          // If parsing fails, treat as single value
          matches = String(fieldValue).toLowerCase().includes(String(rule.value).toLowerCase());
        }
        break;
      }

      case "starts_with":
        matches = String(fieldValue).toLowerCase().startsWith(String(rule.value).toLowerCase());
        break;

      case "ends_with":
        matches = String(fieldValue).toLowerCase().endsWith(String(rule.value).toLowerCase());
        break;

      case "greater_than":
        matches = Number(fieldValue) > Number(rule.value);
        break;

      case "less_than":
        matches = Number(fieldValue) < Number(rule.value);
        break;
    }

    if (matches) {
      return {
        exclude: true,
        reason: `Auto-excluded: ${rule.reason}`,
      };
    }
  }

  return { exclude: false };
}
