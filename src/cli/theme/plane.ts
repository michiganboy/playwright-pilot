// Plane theme configuration - loads ASCII art from text file
import { readFileSync } from "fs";
import { join } from "path";

// Load ASCII art from plane.txt to preserve exact formatting (backticks break template literals)
export const PLANE_ASCII = readFileSync(join(__dirname, "plane.txt"), "utf-8");
