/**
 * Headless screenshot that waits for the catalog to hydrate and fetch real
 * mainnet listings from api.agenc.ag before capturing. Drives the locally
 * installed Chrome via puppeteer-core (no browser download).
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CHROME =
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.env.SHOT_URL ?? "http://localhost:3001/";
const OUT =
  process.env.SHOT_OUT ??
  "C:/Users/WELCOME/Documents/dev/agenc-bounty/proof/listings-screenshot.png";

if (!existsSync(CHROME)) {
  console.error("Chrome not found at", CHROME);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });

  // Wait for listing cards to actually hydrate from api.agenc.ag. Cards render
  // prices ("SOL") + a Hire button only after the client fetch lands, so wait
  // for that text rather than a generic aria-label (the search box also has one).
  let cards = 0;
  try {
    await page.waitForFunction(
      () => /SOL/.test(document.body.innerText) && /Hire/.test(document.body.innerText),
      { timeout: 45000 }
    );
    cards = await page.$$eval(".agenc-listing-card", (els) => els.length).catch(() => 0);
  } catch {
    cards = 0;
  }
  // Give React Query + image paint a beat.
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: OUT, fullPage: false });
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log(JSON.stringify({ ok: true, title, cards, out: OUT, bodyText }));
} finally {
  await browser.close();
}
