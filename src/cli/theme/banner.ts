// ASCII banner utility for CLI startup
import figlet from "figlet";
import { PLANE_ASCII } from "./plane";

/**
 * Generates ASCII art banner using figlet
 * Uses "Slant" font for a compact, stylish look
 */
export function getBanner(): string {
    return figlet.textSync("Playwright Pilot", {
        font: "Slant",
        horizontalLayout: "default",
        verticalLayout: "default",
        width: 120,
    });
}

// Tagline displayed below the banner
const TAGLINE = "Fasten your Seatbelts and Prepare for Takeoff";

/**
 * Combines figlet text and plane ASCII side by side
 * Plane is vertically offset to appear higher
 */
export function getCombinedBanner(): string {
    const figletLines = getBanner().split("\n");
    const planeLines = PLANE_ASCII.split("\n");

    // How many lines to shift the plane UP (positive = higher)
    const planeOffset = 0;

    // Prepend empty lines to plane to shift it up relative to figlet
    const paddedPlaneLines = [
        ...planeLines,
        ...Array(planeOffset).fill(""),
    ];

    // Find max width of figlet text for padding
    const maxFigletWidth = Math.max(...figletLines.map((l) => l.length));

    // Pad figlet to match plane length
    const maxLines = Math.max(figletLines.length, paddedPlaneLines.length);
    while (figletLines.length < maxLines) figletLines.unshift("");

    // Combine side by side with spacing
    const combined = figletLines.map((figletLine, i) => {
        const paddedFiglet = figletLine.padEnd(maxFigletWidth, " ");
        const planeLine = paddedPlaneLines[i] || "";
        return paddedFiglet + planeLine;
    });

    return combined.join("\n");
}

/**
 * Checks if banner should be displayed based on environment
 * Returns false in CI, non-TTY, or when --no-banner flag is present
 */
export function shouldShowBanner(args: string[]): boolean {
    // Skip in CI environments
    if (process.env.CI) {
        return false;
    }

    // Skip if stdout is not a TTY (piped output, redirected, etc.)
    if (!process.stdout.isTTY) {
        return false;
    }

    // Skip if --no-banner flag is present
    if (args.includes("--no-banner")) {
        return false;
    }

    return true;
}

/**
 * Styles a banner line - no gradient, plain output
 */
function styleLine(line: string): string {
    return line;
}

/**
 * Prints combined banner (figlet + plane) line-by-line
 * Only prints when conditions allow (TTY, not CI, no --no-banner flag)
 */
export async function printBanner(args: string[]): Promise<void> {
    if (!shouldShowBanner(args)) {
        return;
    }

    const banner = getCombinedBanner();
    const lines = banner.split("\n");
    const delay = 120; // ms per line

    for (const line of lines) {
        const styledLine = styleLine(line);
        process.stdout.write(styledLine + "\n");
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Calculate total banner width for centering tagline
    const totalWidth = Math.max(...lines.map((l) => l.length));
    const padding = Math.max(0, Math.floor((totalWidth - TAGLINE.length) / 2));
    const centeredTagline = " ".repeat(padding) + TAGLINE;

    // Print tagline centered underneath
    console.log();
    console.log(centeredTagline);
    console.log();
    console.log();
    console.log();
    console.log();
}
