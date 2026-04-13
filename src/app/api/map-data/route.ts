import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const dataPath = path.join(
      process.cwd(),
      "public",
      "data",
      "map-data.json"
    );

    const raw = fs.readFileSync(dataPath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error reading map data:", error);
    return NextResponse.json(
      { error: "Failed to load map data" },
      { status: 500 }
    );
  }
}
