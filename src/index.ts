import { D2PtScraper } from "d2pt.js";
import { createClient } from "redis";
import { metaHeroesType } from "./consts";
import cron from "node-cron";
import * as dotenv from "dotenv";

dotenv.config();

const jobUpdateHeroes = cron.schedule(`0 0 * * *`, async () => {
  console.log("Running cron job update meta heroes...");

  const ROLES = ["HC", "MID", "TOP", "SUP4", "SUP5"];
  const d2pt = new D2PtScraper();

  const redisUrl = process.env.REDIS_HOST;
  const redisClient = createClient({
    url: redisUrl,
  });
  console.log("Start Connection to Redis...");

  redisClient.on("error", (err) => console.log("Redis Client Error", err));
  redisClient.on("connect", () => console.log("Redis Client Connected"));
  await redisClient.connect();

  async function getHeroesMetaWithDelay() {
    console.log("Fetching heroes meta with delay...");
    for (let index = 0; index < ROLES.length; index++) {
      try {
        const ROLE = ROLES[index] as metaHeroesType;
        const getHeroesMetaCache = await redisClient.get(ROLE);
        console.log(`Checking cache for ${ROLES[index]}...`);

        if (getHeroesMetaCache && getHeroesMetaCache.length > 0) {
          console.log(`Data for ${ROLES[index]} already exists in cache`);
          continue;
        }

        const heroesMeta = await d2pt.getHeroesMeta(
          ROLE.toLocaleLowerCase() as metaHeroesType
        );
        console.log(`Fetched data for ${ROLES[index]}:`, heroesMeta);
        await redisClient.set(ROLES[index], JSON.stringify(heroesMeta));
        console.log(`Saved data for ${ROLES[index]} to cache in Redis`);
      } catch (error) {
        console.error(`Error fetching heroes meta for ${ROLES[index]}:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    }
  }

  await getHeroesMetaWithDelay();
});

jobUpdateHeroes.start();
