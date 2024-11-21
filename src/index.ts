import { createClient } from "redis";
import { D2PtScraper } from "d2pt.js";
import { metaHeroesType } from "./consts";
import cron from "node-cron";
import * as dotenv from "dotenv";

dotenv.config();

// Constants
const ROLES = ["HC", "MID", "OFF", "SUP4", "SUP5"];
const CACHE_EXPIRATION = 60 * 60 * 12; // 12 hours in seconds
const FETCH_DELAY = 60 * 1000; // 1 minute in milliseconds
const MAX_ATTEMPTS = 3;

// Redis client setup
const redisClient = createClient({ url: process.env.REDIS_HOST });
redisClient.on("error", (err) => console.error("Redis Client Error:", err));
redisClient.on("connect", () => console.log("Redis Client Connected"));

// D2PT scraper instance
const d2pt = new D2PtScraper();

/**
 * Fetches and caches heroes meta data for a specific role.
 * @param role The role to fetch meta data for.
 */
async function fetchAndCacheHeroMeta(role: string): Promise<void> {
  try {
    console.log(`Checking cache for role: ${role}...`);
    const cachedData = await redisClient.get(role);

    if (cachedData) {
      console.log(`Cache hit for role: ${role}. Skipping fetch.`);
      return;
    }

    console.log(`No cache found for role: ${role}. Fetching data...`);
    let attempts = 0;
    let heroesMeta: any[] | null = null;

    while (
      (!heroesMeta || heroesMeta.length === 0) &&
      attempts < MAX_ATTEMPTS
    ) {
      attempts++;
      try {
        heroesMeta = await d2pt.getHeroesMeta(
          role.toLowerCase() as metaHeroesType,
          5
        );
        if (!heroesMeta || heroesMeta.length === 0) {
          console.warn(
            `Attempt ${attempts} failed for role: ${role}. Retrying...`
          );
        }
      } catch (err) {
        console.error(
          `Error fetching data for role: ${role}, attempt ${attempts}`,
          err
        );
      }
    }

    if (heroesMeta && heroesMeta.length > 0) {
      console.log(`Fetched data for role: ${role}. Caching to Redis...`);
      await redisClient.set(role.toLowerCase(), JSON.stringify(heroesMeta), {
        EX: CACHE_EXPIRATION,
      });
      console.log(`Data for role: ${role} successfully cached.`);
    } else {
      console.warn(
        `Failed to fetch data for role: ${role} after ${MAX_ATTEMPTS} attempts.`
      );
    }
  } catch (err) {
    console.error(`Unexpected error while processing role: ${role}`, err);
  }
}

/**
 * Fetches heroes meta data for all roles with a delay between each fetch.
 */
async function fetchAllHeroesMetaWithDelay(): Promise<void> {
  console.log("Starting fetch for all roles...");
  for (const role of ROLES) {
    await fetchAndCacheHeroMeta(role);
    console.log(`Delaying next fetch for ${FETCH_DELAY / 1000} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY));
  }
  console.log("Finished fetching all roles.");
}

/**
 * Initializes the application, connects to Redis, and sets up the cron job.
 */
async function init(): Promise<void> {
  try {
    console.log("Connecting to Redis...");
    await redisClient.connect();

    console.log("Fetching initial heroes meta data...");
    await fetchAllHeroesMetaWithDelay();

    console.log(
      "Setting up cron job to update heroes meta data every 12 hours..."
    );
    cron.schedule("0 */12 * * *", async () => {
      console.log("Running scheduled task: Updating heroes meta data...");
      await fetchAllHeroesMetaWithDelay();
    });
  } catch (err) {
    console.error("Error during initialization:", err);
  }
}

// Start the application
init();
