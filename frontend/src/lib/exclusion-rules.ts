/**
 * Auto-exclusion rules for expenses
 * These rules determine which expenses should be automatically excluded from margin calculations
 */

export interface ExclusionRule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  field: "account_name" | "description" | "customer_name" | "amount" | "notes";
  operator: "equals" | "contains" | "starts_with" | "ends_with" | "greater_than" | "less_than";
  value: string | number;
  reason: string; // Reason to show when expense is excluded
  is_default?: boolean; // Optional flag for default rules
}

/**
 * Check if an expense should be excluded based on rules
 */
export function shouldExcludeExpense(
  expense: {
    account_name?: string | null;
    description?: string | null;
    customer_name?: string | null;
    amount?: number;
    total?: number;
    notes?: string | null;
  },
  rules: ExclusionRule[]
): { exclude: boolean; reason?: string } {
  const enabledRules = rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    const fieldValue = expense[rule.field];

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
