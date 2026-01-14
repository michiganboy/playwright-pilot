// ASCII banner utility for CLI startup
import figlet from "figlet";
import { PLANE_ASCII } from "./plane";

// Banner width thresholds
const FULL_BANNER_MIN_WIDTH = 100;  // Full "Playwright Pilot" + plane
const MEDIUM_BANNER_MIN_WIDTH = 70; // "Playwright Pilot" in Small Slant, no plane
// Below 70: "PP" + plane

// Tagline displayed below the banner
const TAGLINE = "Fasten your Seatbelts and Prepare for Takeoff";

/**
 * Generates full-size ASCII art banner (Slant font)
 */
function getFullBanner(): string {
    return figlet.textSync("Playwright Pilot", {
        font: "Slant",
        horizontalLayout: "default",
        verticalLayout: "default",
        width: 120,
    });
}

/**
 * Generates medium-size ASCII art banner (Small Slant font)
 */
function getMediumBanner(): string {
    return figlet.textSync("Playwright Pilot", {
        font: "Small Slant",
        horizontalLayout: "default",
        verticalLayout: "default",
    });
}

/**
 * Generates mini ASCII art banner (PP in Slant font)
 */
function getMiniBanner(): string {
    return figlet.textSync("PP", {
        font: "Slant",
        horizontalLayout: "default",
        verticalLayout: "default",
    });
}

/**
 * Combines figlet text and plane ASCII side by side
 */
function combineBannerWithPlane(bannerText: string): string {
    const figletLines = bannerText.split("\n");
    const planeLines = PLANE_ASCII.split("\n");

    // Find max width of figlet text for padding
    const maxFigletWidth = Math.max(...figletLines.map((l) => l.length));

    // Pad figlet to match plane length
    const maxLines = Math.max(figletLines.length, planeLines.length);
    while (figletLines.length < maxLines) figletLines.unshift("");

    // Combine side by side with spacing
    const combined = figletLines.map((figletLine, i) => {
        const paddedFiglet = figletLine.padEnd(maxFigletWidth, " ");
        const planeLine = planeLines[i] || "";
        return paddedFiglet + planeLine;
    });

    return combined.join("\n");
}

/**
 * Gets the appropriate banner based on terminal width
 */
export function getCombinedBanner(): string {
    const terminalWidth = process.stdout.columns || 100;

    if (terminalWidth >= FULL_BANNER_MIN_WIDTH) {
        // Full banner: "Playwright Pilot" (Slant) + plane
        return combineBannerWithPlane(getFullBanner());
    } else if (terminalWidth >= MEDIUM_BANNER_MIN_WIDTH) {
        // Medium banner: "Playwright Pilot" (Small Slant), no plane
        return getMediumBanner();
    } else {
        // Mini banner: "PP" (Slant) + plane
        return combineBannerWithPlane(getMiniBanner());
    }
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
