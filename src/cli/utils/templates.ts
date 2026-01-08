// Template rendering utilities.
import { readFileSafe } from "./fileOps";
import { paths } from "./paths";

/**
 * Renders a template by replacing placeholders.
 */
export function renderTemplate(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

/**
 * Loads a template file.
 */
export async function loadTemplate(templateName: string): Promise<string> {
  const templatePath = paths.templates(templateName);
  const content = await readFileSafe(templatePath);
  if (!content) {
    throw new Error(`Template not found: ${templateName}`);
  }
  return content;
}
